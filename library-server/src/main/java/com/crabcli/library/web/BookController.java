package com.crabcli.library.web;

import com.crabcli.library.domain.Book;
import com.crabcli.library.service.BookService;
import com.crabcli.library.web.dto.BookDtos.BookCreateRequest;
import com.crabcli.library.web.dto.BookDtos.BookPage;
import com.crabcli.library.web.dto.BookDtos.BookUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 书籍管理契约（BE-B06 / Issue #121）：
 * <ul>
 *   <li>{@code POST /api/books} → 201 返回新书目（availableCopies=totalCopies）；
 *       重复编号 409 DUPLICATE_BOOK_CODE；categoryId 不存在 400 VALIDATION_ERROR；</li>
 *   <li>{@code GET /api/books?q&categoryId&page&size} → 分页 {items,total,page,size}，
 *       q 命中 title/author/keywords；</li>
 *   <li>{@code GET /api/books/{id}} → 单本详情；缺失 404 BOOK_NOT_FOUND；</li>
 *   <li>{@code PUT /api/books/{id}} → 部分更新（null = 保持原值）；</li>
 *   <li>{@code POST /api/books/{id}/withdraw} → 200 status=WITHDRAWN，幂等（重复调仍 200）。</li>
 * </ul>
 * 鉴权由 SecurityConfig 既有规则覆盖（#118：books 写 LIBRARIAN/ADMIN，读 authenticated），
 * 这里不再重复。
 */
@RestController
public class BookController {

    private final BookService service;

    public BookController(BookService service) {
        this.service = service;
    }

    @PostMapping("/api/books")
    public ResponseEntity<Book> create(@Valid @RequestBody BookCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @GetMapping("/api/books")
    public BookPage list(@RequestParam(required = false) String q,
                         @RequestParam(required = false) Integer categoryId,
                         @RequestParam(defaultValue = "1") int page,
                         @RequestParam(defaultValue = "20") int size) {
        return service.search(q, categoryId, page, size);
    }

    @GetMapping("/api/books/{id}")
    public Book get(@PathVariable int id) {
        return service.get(id);
    }

    @PutMapping("/api/books/{id}")
    public Book update(@PathVariable int id, @Valid @RequestBody BookUpdateRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/api/books/{id}/withdraw")
    public Book withdraw(@PathVariable int id) {
        return service.withdraw(id);
    }
}
