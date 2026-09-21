package com.crabcli.library.service;

import com.crabcli.library.domain.Book;
import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.crabcli.library.domain.Reader;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReservationRepository;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 借书规则校验链（BE-B08 / Issue #123，契约定稿顺序，不可调换）：
 * <ol>
 *   <li>读者存在 → 404 {@code READER_NOT_FOUND}（BorrowService 加载档案）；</li>
 *   <li>书存在 → 404 {@code BOOK_NOT_FOUND}（同上）；</li>
 *   <li>未注销 → 409 {@code READER_INACTIVE}；</li>
 *   <li>未下架 → 409 {@code BOOK_WITHDRAWN}；</li>
 *   <li>无逾期 → 409 {@code READER_HAS_OVERDUE}；</li>
 *   <li>预约归属 → 409 {@code RESERVED_FOR_OTHER_READER}；</li>
 *   <li>配额 → 409 {@code QUOTA_EXCEEDED}；</li>
 *   <li>可借副本 → 409 {@code NO_AVAILABLE_COPY}。</li>
 * </ol>
 * 任一步不通过即抛 {@link ApiException}，后续步骤不再执行——多规则同时违反时
 * 落在最先违反的那条上（如「配额先于副本」）。拒绝文案中文直显，由本类负责。
 * <p>口径来源：逾期判定复用 {@link BorrowRecord#effectiveStatus(LocalDate)} 契约派生
 * （不在 SQL 里复写逾期算式）；配额读 {@link Reader} 的 JOIN 实时读数（F11 参数化
 * 即时生效）；可借副本读 {@link Book#availableCopies()}（与 AvailableCopiesService
 * 同一段口径 SQL）。
 */
@Service
public class BorrowRuleValidator {

    private final BorrowRepository borrowRepository;
    private final ReservationRepository reservationRepository;

    public BorrowRuleValidator(BorrowRepository borrowRepository,
                               ReservationRepository reservationRepository) {
        this.borrowRepository = borrowRepository;
        this.reservationRepository = reservationRepository;
    }

    /** 按契约定稿顺序执行 ③-⑧（①②由调用方在加载档案时完成）。 */
    public void validate(Reader reader, Book book, LocalDate today) {
        requireNotInactive(reader);
        requireNotWithdrawn(book);
        requireNoOverdue(reader.id(), today);
        requireNotReservedForOther(book.id(), reader.id());
        requireUnderQuota(reader);
        requireAvailableCopy(book);
    }

    private void requireNotInactive(Reader reader) {
        if (!"ACTIVE".equals(reader.status())) {
            throw new ApiException("READER_INACTIVE", "读者已注销，不能借书", HttpStatus.CONFLICT);
        }
    }

    private void requireNotWithdrawn(Book book) {
        if (Book.STATUS_WITHDRAWN.equals(book.status())) {
            throw new ApiException("BOOK_WITHDRAWN", "书籍已下架，不能借出", HttpStatus.CONFLICT);
        }
    }

    private void requireNoOverdue(int readerId, LocalDate today) {
        boolean hasOverdue = borrowRepository.findBorrowedByReader(readerId).stream()
                .anyMatch(record -> record.effectiveStatus(today) == BorrowStatus.OVERDUE);
        if (hasOverdue) {
            throw new ApiException("READER_HAS_OVERDUE", "读者有逾期未还图书，归还逾期图书后才能借书",
                    HttpStatus.CONFLICT);
        }
    }

    private void requireNotReservedForOther(int bookId, int readerId) {
        if (reservationRepository.existsHeldByOther(bookId, readerId)) {
            throw new ApiException("RESERVED_FOR_OTHER_READER", "该书籍已被其他读者预约保留，暂不能借出",
                    HttpStatus.CONFLICT);
        }
    }

    private void requireUnderQuota(Reader reader) {
        if (reader.activeBorrowCount() >= reader.maxBorrow()) {
            throw new ApiException("QUOTA_EXCEEDED",
                    "当前已借 %d 本，最多借 %d 本，不能继续借书"
                            .formatted(reader.activeBorrowCount(), reader.maxBorrow()),
                    HttpStatus.CONFLICT);
        }
    }

    private void requireAvailableCopy(Book book) {
        if (book.availableCopies() <= 0) {
            throw new ApiException("NO_AVAILABLE_COPY", "该书籍暂无可借副本", HttpStatus.CONFLICT);
        }
    }
}
