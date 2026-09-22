package com.crabcli.library.service;

import com.crabcli.library.domain.Book;
import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.crabcli.library.domain.Reader;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BookRepository;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReaderRepository;
import com.crabcli.library.repo.ReaderTypeRepository;
import com.crabcli.library.web.dto.BorrowDtos.BorrowRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 借书 / 还书 / 续借业务（BE-B08 / Issue #123、BE-B10 / Issue #125、BE-B11 / Issue #126）：
 * 借出为加载档案 →
 * 规则校验链（顺序契约定稿，见 {@link BorrowRuleValidator}）→ 落借阅行。借期按读者
 * 类型参数化：{@code dueDate = borrowDate + loanWeeks × 7 天}（NORMAL 4 周 / TEACHER
 * 8 周，reader_types PUT 后下一次借出即按新值）。时间列沿 schema 约定存 TEXT ISO-8601
 * UTC：borrowed_at 为借出时刻、due_at 为到期日零点（与 {@link BorrowRecord#dueDate()}
 * 的前 10 字符日期解析一致）。
 * <p>错误码：404 {@code READER_NOT_FOUND} / {@code BOOK_NOT_FOUND}（沿用 #120/#121
 * 同码同语义）；校验链拒绝码见 {@link BorrowRuleValidator}；还书 404
 * {@code BORROW_NOT_FOUND}、非在借再还 409 {@code BORROW_NOT_ACTIVE}。
 * <p>续借入口（BE-B11 / Issue #126）：{@link #renew(int)} 薄委托
 * {@link RenewService}——规则与写路径归续借域，本类保持借出 / 还书域职责单一。
 * 丢失登记 / 赔偿结算入口（BE-B13 / Issue #128）：{@link #markLost(int, BigDecimal)} 与
 * {@link #compensate(int)} 同款薄委托 {@link LostCompensationService}。
 */
@Service
public class BorrowService {

    private final ReaderRepository readerRepository;
    private final BookRepository bookRepository;
    private final ReaderTypeRepository readerTypeRepository;
    private final BorrowRepository borrowRepository;
    private final BorrowRuleValidator validator;
    private final ReservationExpirySweeper sweeper;
    private final RenewService renewService;
    private final LostCompensationService lostCompensationService;

    public BorrowService(ReaderRepository readerRepository, BookRepository bookRepository,
                         ReaderTypeRepository readerTypeRepository, BorrowRepository borrowRepository,
                         BorrowRuleValidator validator, ReservationExpirySweeper sweeper,
                         RenewService renewService, LostCompensationService lostCompensationService) {
        this.readerRepository = readerRepository;
        this.bookRepository = bookRepository;
        this.readerTypeRepository = readerTypeRepository;
        this.borrowRepository = borrowRepository;
        this.validator = validator;
        this.sweeper = sweeper;
        this.renewService = renewService;
        this.lostCompensationService = lostCompensationService;
    }

    /** 借出一本：校验链全过 → 落 status=BORROWED 行，返回创建后的借阅记录。 */
    public BorrowRecord borrow(BorrowRequest request) {
        Reader reader = readerRepository.findById(request.readerId())
                .orElseThrow(() -> new ApiException("READER_NOT_FOUND", "读者不存在", HttpStatus.NOT_FOUND));
        Book book = bookRepository.findById(request.bookId())
                .orElseThrow(() -> new ApiException("BOOK_NOT_FOUND", "书籍不存在", HttpStatus.NOT_FOUND));

        LocalDate today = LocalDate.now();
        validator.validate(reader, book, today);

        int loanWeeks = readerTypeRepository.findByCode(reader.readerTypeCode())
                .orElseThrow(() -> new ApiException("READER_TYPE_NOT_FOUND", "读者类型不存在",
                        HttpStatus.NOT_FOUND))
                .loanWeeks();
        String dueAt = today.plusWeeks(loanWeeks) + "T00:00:00.000Z";
        int id = borrowRepository.insert(reader.id(), book.id(), Instant.now().toString(), dueAt);
        return borrowRepository.findById(id).orElseThrow();
    }

    /**
     * 还书登记（BE-B10 / Issue #125）：在借行（存储 BORROWED，逾期为读时派生态不落库、
     * 照常走本路径）置 returned_at = 当日、status = RETURNED。
     * <p>F4↔F5 衔接：入口先 {@link ReservationExpirySweeper#sweepExpiredHolds()} 惰性
     * 结算（同 {@code ReservationService#cancel} 的「结算先行」惯例，避免把仍记 HELD
     * 的过期保留当占位、递补出双 HELD），再经
     * {@link ReservationExpirySweeper#promoteNextWaiting(int)} 把该书队首 WAITING →
     * HELD 并开 3 天保留窗口——递补语义一处表达，不另写。
     * <p>原子性：{@code @Transactional} 保证「还书落账 + 队列递补」在同一 SQLite 单写
     * 事务内完成，任一步失败整体回滚；SQLite 无 SELECT FOR UPDATE，单写事务本身即
     * reservations 队列选取的锁，并发还书 / 预约操作由单写者串行化。
     * <p>availableCopies 无需手调：口径 SQL（AvailableCopiesService）读时实时派生——
     * 无预约时存储 BORROWED 计数 −1，副本回池（+1）；有预约时 BORROWED −1 与
     * HELD +1 相抵，保留副本不入池。
     * <p>错误码：404 {@code BORROW_NOT_FOUND}；RETURNED / LOST / LOST_PAID 等非在借行
     * 再还 → 409 {@code BORROW_NOT_ACTIVE}。
     */
    @Transactional
    public BorrowRecord returnBook(int borrowId) {
        BorrowRecord record = borrowRepository.findById(borrowId)
                .orElseThrow(() -> new ApiException("BORROW_NOT_FOUND", "借阅记录不存在",
                        HttpStatus.NOT_FOUND));
        if (!BorrowStatus.BORROWED.name().equals(record.status())) {
            throw new ApiException("BORROW_NOT_ACTIVE", "借阅已归还或已失效，不能重复还书",
                    HttpStatus.CONFLICT);
        }
        sweeper.sweepExpiredHolds();
        borrowRepository.markReturned(borrowId, LocalDate.now() + "T00:00:00.000Z");
        sweeper.promoteNextWaiting(record.bookId());
        return borrowRepository.findById(borrowId).orElseThrow();
    }

    /** 续借入口（BE-B11）：薄委托 {@link RenewService}，规则与写路径归续借域。 */
    public BorrowRecord renew(int borrowRecordId) {
        return renewService.renew(borrowRecordId);
    }

    /** 丢失登记入口（BE-B13）：薄委托 {@link LostCompensationService}，规则与写路径归赔偿域。 */
    public BorrowRecord markLost(int borrowRecordId, BigDecimal compensationAmount) {
        return lostCompensationService.markLost(borrowRecordId, compensationAmount);
    }

    /** 赔偿结算入口（BE-B13）：薄委托 {@link LostCompensationService}。 */
    public BorrowRecord compensate(int borrowRecordId) {
        return lostCompensationService.compensate(borrowRecordId);
    }
}
