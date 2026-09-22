package com.crabcli.library.service;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.auth.Role;
import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.web.dto.BorrowQueryDtos.BorrowQueryPage;
import com.crabcli.library.web.dto.BorrowQueryDtos.BorrowQueryView;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 借阅查询业务（BE-B12 / Issue #127）：多条件过滤（readerId / 生效 status /
 * borrowDate 闭区间）+ SQL 层分页，total 为过滤后总数。
 * <ul>
 *   <li>入口先 {@link ReservationExpirySweeper#sweepExpiredHolds()} 惰性结算
 *       （[假设 B6]，ReservationController javadoc 预告的 #127 同款接入）——前端
 *       拿到结算后状态，OVERDUE 行不被过期 HELD 虚占；</li>
 *   <li>READER 隔离（[安全] 服务端强制）：readerId 缺省即查本人；显式传他人
 *       readerId → 403 {@code FORBIDDEN}，前端兜不住，token.readerId 为准；</li>
 *   <li>参数边界回 400 {@code VALIDATION_ERROR}：page ≥ 1、size 1-100（契约上限，
 *       BookService 同口径）、status 白名单（{@code BorrowStatus} 生效态）、
 *       from ≤ to；</li>
 *   <li>逾期天数：仅生效 OVERDUE 行非 0（{@code BorrowRecord#overdueDays}，当天 = 0、
 *       超 1 天 = 1）；RETURNED / LOST 行历史逾期不回显，查询口径为「当前逾期」。</li>
 * </ul>
 */
@Service
public class BorrowQueryService {

    /** 契约上限（#115）：分页 size 最大 100。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final BorrowRepository borrowRepository;
    private final ReservationExpirySweeper sweeper;

    public BorrowQueryService(BorrowRepository borrowRepository,
                              ReservationExpirySweeper sweeper) {
        this.borrowRepository = borrowRepository;
        this.sweeper = sweeper;
    }

    /** 多条件查询：结算先行 → READER 隔离 → 参数校验 → SQL 过滤分页 → 视图映射。 */
    public BorrowQueryPage search(LoginUser actor, Integer readerId, String status,
                                  LocalDate from, LocalDate to, int page, int size) {
        sweeper.sweepExpiredHolds();

        if (actor.role() == Role.READER) {
            if (readerId != null && !readerId.equals(actor.readerId())) {
                throw new ApiException("FORBIDDEN", "只能查询本人借阅记录", HttpStatus.FORBIDDEN);
            }
            readerId = actor.readerId();
        }
        if (page < 1) {
            throw new ApiException("VALIDATION_ERROR", "page 需不小于 1", HttpStatus.BAD_REQUEST);
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ApiException("VALIDATION_ERROR", "size 需在 1-" + MAX_PAGE_SIZE + " 之间",
                    HttpStatus.BAD_REQUEST);
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiException("VALIDATION_ERROR", "from 不能晚于 to", HttpStatus.BAD_REQUEST);
        }
        if (status != null && !isValidEffectiveStatus(status)) {
            throw new ApiException("VALIDATION_ERROR", "status 非法，允许值："
                    + String.join(" / ", statusLiterals()), HttpStatus.BAD_REQUEST);
        }

        LocalDate today = LocalDate.now();
        List<BorrowQueryView> items = borrowRepository
                .search(readerId, status, from, to, today, page, size).stream()
                .map(record -> toView(record, today))
                .toList();
        long total = borrowRepository.countSearch(readerId, status, from, to, today);
        return new BorrowQueryPage(items, total, page, size);
    }

    private BorrowQueryView toView(BorrowRecord record, LocalDate today) {
        String effectiveStatus = record.effectiveStatus(today).name();
        long overdueDays = BorrowStatus.OVERDUE.name().equals(effectiveStatus)
                ? record.overdueDays(today)
                : 0;
        return new BorrowQueryView(record.id(), record.readerId(), record.bookId(),
                record.borrowedAt().substring(0, 10), record.dueAt().substring(0, 10),
                record.returnedAt() == null ? null : record.returnedAt().substring(0, 10),
                record.renewCount(), effectiveStatus, record.compensationStatus(), overdueDays);
    }

    private static boolean isValidEffectiveStatus(String status) {
        try {
            BorrowStatus.valueOf(status);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static List<String> statusLiterals() {
        return List.of(BorrowStatus.values()).stream().map(Enum::name).toList();
    }
}
