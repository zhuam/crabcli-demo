package com.crabcli.library.web;

import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.service.BorrowService;
import com.crabcli.library.web.dto.BorrowDtos.BorrowRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 借书 / 还书契约（BE-B08 / Issue #123、BE-B10 / Issue #125）：
 * {@code POST /api/borrows} → 201 返回创建的借阅记录（status=BORROWED，dueAt 按
 * 读者类型借期）；规则拒绝见 {@code BorrowRuleValidator} 的 409 错误码契约，缺失
 * 引用 404。{@code POST /api/borrows/{id}/return} → 200 返回还书后的记录
 * （status=RETURNED、returnedAt=当日；有排队预约时同事务递补队首 WAITING → HELD），
 * 404 BORROW_NOT_FOUND、非在借再还 409 BORROW_NOT_ACTIVE。
 * 鉴权由 SecurityConfig 既有规则覆盖（#118：borrows 写 LIBRARIAN/ADMIN），
 * 这里不再重复。
 */
@RestController
public class BorrowController {

    private final BorrowService service;

    public BorrowController(BorrowService service) {
        this.service = service;
    }

    @PostMapping("/api/borrows")
    public ResponseEntity<BorrowRecord> borrow(@Valid @RequestBody BorrowRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.borrow(request));
    }

    @PostMapping("/api/borrows/{id}/return")
    public BorrowRecord returnBook(@PathVariable int id) {
        return service.returnBook(id);
    }
}
