package com.crabcli.library.service;

import com.crabcli.library.domain.Book;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BookRepository;
import com.crabcli.library.repo.CategoryRepository;
import com.crabcli.library.web.dto.BookDtos.BookCreateRequest;
import com.crabcli.library.web.dto.BookDtos.BookPage;
import com.crabcli.library.web.dto.BookDtos.BookUpdateRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.stereotype.Service;

/**
 * 书籍管理（BE-B06 / Issue #121）：新增 / 修改 / 查询 / 下架。
 * <p>错误码（沿用 #117 统一错误体，业务码按 ErrorCode 约定直接传构造器）：
 * 404 {@code BOOK_NOT_FOUND}；409 {@code DUPLICATE_BOOK_CODE}——重复编号以
 * idx_books_book_code 唯一索引兜底，服务层把约束违约转成 409（并发下两条同路径同归 409）；
 * categoryId 不存在与分页参数越界回 400 {@code VALIDATION_ERROR}（#121 验收口径）。
 * <p>下架幂等：已 WITHDRAWN 的书再次 withdraw 直接返回现值，不重复写库。
 * availableCopies 正式口径收口于 {@link AvailableCopiesService}（#122），书目行与单书查询同源。
 */
@Service
public class BookService {

    /** 契约上限（#115）：分页 size 最大 100。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final BookRepository bookRepository;
    private final CategoryRepository categoryRepository;

    public BookService(BookRepository bookRepository, CategoryRepository categoryRepository) {
        this.bookRepository = bookRepository;
        this.categoryRepository = categoryRepository;
    }

    public Book create(BookCreateRequest request) {
        requireCategory(request.categoryId());
        String bookCode = request.bookCode().trim();
        int id;
        try {
            id = bookRepository.insert(bookCode, request.title(), request.author(),
                    request.categoryId(), request.keywords(), request.totalCopies(), request.remark());
        } catch (UncategorizedSQLException e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE constraint failed")) {
                throw new ApiException("DUPLICATE_BOOK_CODE", "书籍编号已存在：" + bookCode,
                        HttpStatus.CONFLICT);
            }
            throw e;
        }
        return bookRepository.findById(id).orElseThrow();
    }

    public Book get(int id) {
        return requireBook(id);
    }

    public BookPage search(String q, Integer categoryId, int page, int size) {
        if (page < 1) {
            throw new ApiException("VALIDATION_ERROR", "page 需不小于 1", HttpStatus.BAD_REQUEST);
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ApiException("VALIDATION_ERROR", "size 需在 1-" + MAX_PAGE_SIZE + " 之间",
                    HttpStatus.BAD_REQUEST);
        }
        List<Book> items = bookRepository.search(q, categoryId, page, size);
        long total = bookRepository.count(q, categoryId);
        return new BookPage(items, total, page, size);
    }

    public Book update(int id, BookUpdateRequest request) {
        requireBook(id);
        if (request.title() == null && request.author() == null && request.categoryId() == null
                && request.keywords() == null && request.totalCopies() == null
                && request.remark() == null) {
            throw new ApiException("VALIDATION_ERROR", "至少提供一个更新字段", HttpStatus.BAD_REQUEST);
        }
        // 部分更新：只有提供了才校验空白（@NotBlank 对 null 也违规，不能用在可选字段上）
        if (request.title() != null && request.title().isBlank()) {
            throw new ApiException("VALIDATION_ERROR", "书名不能为空白", HttpStatus.BAD_REQUEST);
        }
        if (request.author() != null && request.author().isBlank()) {
            throw new ApiException("VALIDATION_ERROR", "作者不能为空白", HttpStatus.BAD_REQUEST);
        }
        if (request.categoryId() != null) {
            requireCategory(request.categoryId());
        }
        bookRepository.update(id, request.title(), request.author(), request.categoryId(),
                request.keywords(), request.totalCopies(), request.remark());
        return bookRepository.findById(id).orElseThrow();
    }

    public Book withdraw(int id) {
        Book book = requireBook(id);
        if (Book.STATUS_WITHDRAWN.equals(book.status())) {
            return book;
        }
        bookRepository.markWithdrawn(id);
        return bookRepository.findById(id).orElseThrow();
    }

    private Book requireBook(int id) {
        return bookRepository.findById(id)
                .orElseThrow(() -> new ApiException("BOOK_NOT_FOUND", "书籍不存在",
                        HttpStatus.NOT_FOUND));
    }

    /** 类别不存在回 400 VALIDATION_ERROR（#121 验收口径，非 404）。 */
    private void requireCategory(int categoryId) {
        if (categoryRepository.findById(categoryId).isEmpty()) {
            throw new ApiException("VALIDATION_ERROR", "类别不存在：" + categoryId,
                    HttpStatus.BAD_REQUEST);
        }
    }
}
