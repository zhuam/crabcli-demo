package com.crabcli.library.service;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.auth.Role;
import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.crabcli.library.domain.Reader;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReaderRepository;
import com.crabcli.library.repo.ReaderTypeRepository;
import com.crabcli.library.repo.ReservationRepository;
import java.time.LocalDate;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 续借业务（BE-B11 / Issue #123、#124 之上的 #126）：加载借阅行 → 规则校验链
 * （顺序契约定稿，不可调换）→ 原到期日顺延。借期与借出（BE-B08）同源参数化：
 * {@code dueDate = 原 dueDate + loanWeeks × 7 天}（NORMAL 4 周 / TEACHER 8 周，
 * reader_types PUT 后下一次续借即按新值）；renewCount 0 → 1，每本限 1 次
 * （schema.sql CHECK 兜底）。
 * <p>校验链顺序：<ol>
 *   <li>记录存在 → 404 {@code BORROW_NOT_FOUND}；</li>
 *   <li>存储态 BORROWED → 409 {@code BORROW_NOT_ACTIVE}（RETURNED / LOST / LOST_PAID
 *       均为已结束借阅，#125/#126/#128 共用同码）；</li>
 *   <li>本记录未逾期 → 409 {@code RENEW_BLOCKED_BY_OVERDUE}（[假设 B5] PRD 未明示，
 *       取从严与 F8 归还拦截一致；逾期判定复用 {@link BorrowRecord#effectiveStatus(LocalDate)}
 *       契约派生，不在 SQL 里复写逾期算式）；</li>
 *   <li>未续借过 → 409 {@code RENEW_LIMIT_REACHED}；</li>
 *   <li>无他人有效预约 → 409 {@code RENEW_BLOCKED_BY_RESERVATION}（WAITING / HELD
 *       均拦——续借继续推迟副本回池，排队者与保留者都被损害；本人预约不拦）。</li>
 * </ol>任一步不通过即抛 {@link ApiException}，后续步骤不再执行。拒绝文案中文直显，由本类负责。
 * <p>预约阻断校验先 {@link ReservationExpirySweeper#sweepExpiredHolds()} 惰性结算
 * 过期 HELD（#124 惯例：读到「仍生效预约」的入口先结算，过期保留不误拦续借）。写路径为
 * 守卫式 UPDATE（status='BORROWED' AND renew_count=0，见 {@link BorrowRepository#renew}）：
 * 校验与写之间的并发窗口内记录被还 / 被续时 0 行命中，重载最新行重走校验链一次——
 * 校验链按最新状态抛出真实拒绝码，并发第二次续借得到契约 409 而非 500。
 */
@Service
public class RenewService {

    private final BorrowRepository borrowRepository;
    private final ReaderRepository readerRepository;
    private final ReaderTypeRepository readerTypeRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationExpirySweeper sweeper;

    public RenewService(BorrowRepository borrowRepository, ReaderRepository readerRepository,
                        ReaderTypeRepository readerTypeRepository,
                        ReservationRepository reservationRepository,
                        ReservationExpirySweeper sweeper) {
        this.borrowRepository = borrowRepository;
        this.readerRepository = readerRepository;
        this.readerTypeRepository = readerTypeRepository;
        this.reservationRepository = reservationRepository;
        this.sweeper = sweeper;
    }

    /**
     * 续借一本：校验链全过 → 原到期日顺延、renewCount 变 1，返回续借后的借阅记录。
     * <p>READER 仅可续借本人借阅（WEB-8 / #139 自助续借，SecurityConfig 对本路由放行
     * 至 authenticated），他人借阅 403 {@code FORBIDDEN}；馆员 / 管理员可续借任意
     * （#126 既有行为不变）。归属判定与 {@code ReservationService#cancel} 同款。
     */
    public BorrowRecord renew(int borrowRecordId, LoginUser actor) {
        BorrowRecord record = borrowRepository.findById(borrowRecordId)
                .orElseThrow(() -> new ApiException("BORROW_NOT_FOUND", "借阅记录不存在",
                        HttpStatus.NOT_FOUND));
        if (actor.role() == Role.READER
                && !Objects.equals(record.readerId(), actor.readerId())) {
            throw new ApiException("FORBIDDEN", "只能续借本人借阅", HttpStatus.FORBIDDEN);
        }
        LocalDate today = LocalDate.now();
        validate(record, today);

        LocalDate newDueDate = record.dueDate()
                .plusWeeks(loanWeeksOf(record.readerId()));
        if (borrowRepository.renew(borrowRecordId, newDueDate + "T00:00:00.000Z") == 0) {
            // 并发窗口内状态已变：以最新行重判（有界一次，SQLite 单写者下必收敛）
            return renew(borrowRecordId, actor);
        }
        return borrowRepository.findById(borrowRecordId).orElseThrow();
    }

    /** 按契约定稿顺序执行 ②-⑤（①由调用方加载记录时完成）。 */
    private void validate(BorrowRecord record, LocalDate today) {
        requireActiveBorrow(record, today);
        requireNotRenewed(record);
        requireNotReservedForOther(record);
    }

    private void requireActiveBorrow(BorrowRecord record, LocalDate today) {
        if (!BorrowStatus.BORROWED.name().equals(record.status())) {
            throw new ApiException("BORROW_NOT_ACTIVE", "该借阅记录已结束，不能续借",
                    HttpStatus.CONFLICT);
        }
        if (record.effectiveStatus(today) == BorrowStatus.OVERDUE) {
            throw new ApiException("RENEW_BLOCKED_BY_OVERDUE", "该借阅记录已逾期，归还后不能续借",
                    HttpStatus.CONFLICT);
        }
    }

    private void requireNotRenewed(BorrowRecord record) {
        if (record.renewCount() >= 1) {
            throw new ApiException("RENEW_LIMIT_REACHED", "续借次数已达上限，每本限续借 1 次",
                    HttpStatus.CONFLICT);
        }
    }

    private void requireNotReservedForOther(BorrowRecord record) {
        sweeper.sweepExpiredHolds();
        if (reservationRepository.existsActiveByOther(record.bookId(), record.readerId())) {
            throw new ApiException("RENEW_BLOCKED_BY_RESERVATION",
                    "该书籍已被其他读者预约或排队，不能续借", HttpStatus.CONFLICT);
        }
    }

    /** 借期实时读读者类型（F11 参数化即时生效，与借出 BE-B08 同款读法）。 */
    private int loanWeeksOf(int readerId) {
        Reader reader = readerRepository.findById(readerId)
                .orElseThrow(() -> new ApiException("READER_NOT_FOUND", "读者不存在",
                        HttpStatus.NOT_FOUND));
        return readerTypeRepository.findByCode(reader.readerTypeCode())
                .orElseThrow(() -> new ApiException("READER_TYPE_NOT_FOUND", "读者类型不存在",
                        HttpStatus.NOT_FOUND))
                .loanWeeks();
    }
}
