package com.crabcli.library.service;

import com.crabcli.library.domain.Book;
import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.Reader;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BookRepository;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReaderRepository;
import com.crabcli.library.repo.ReaderTypeRepository;
import com.crabcli.library.web.dto.BorrowDtos.BorrowRequest;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 借书业务（BE-B08 / Issue #123）：加载档案 → 规则校验链（顺序契约定稿，见
 * {@link BorrowRuleValidator}）→ 落借阅行。借期按读者类型参数化：
 * {@code dueDate = borrowDate + loanWeeks × 7 天}（NORMAL 4 周 / TEACHER 8 周，
 * reader_types PUT 后下一次借出即按新值）。时间列沿 schema 约定存 TEXT ISO-8601 UTC：
 * borrowed_at 为借出时刻、due_at 为到期日零点（与 {@link BorrowRecord#dueDate()} 的
 * 前 10 字符日期解析一致）。
 * <p>错误码：404 {@code READER_NOT_FOUND} / {@code BOOK_NOT_FOUND}（沿用 #120/#121
 * 同码同语义）；校验链拒绝码见 {@link BorrowRuleValidator}。
 */
@Service
public class BorrowService {

    private final ReaderRepository readerRepository;
    private final BookRepository bookRepository;
    private final ReaderTypeRepository readerTypeRepository;
    private final BorrowRepository borrowRepository;
    private final BorrowRuleValidator validator;

    public BorrowService(ReaderRepository readerRepository, BookRepository bookRepository,
                         ReaderTypeRepository readerTypeRepository, BorrowRepository borrowRepository,
                         BorrowRuleValidator validator) {
        this.readerRepository = readerRepository;
        this.bookRepository = bookRepository;
        this.readerTypeRepository = readerTypeRepository;
        this.borrowRepository = borrowRepository;
        this.validator = validator;
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
}
