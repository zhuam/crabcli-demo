package com.crabcli.library.web;

import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.service.BorrowService;
import com.crabcli.library.web.dto.BorrowDtos.BorrowRequest;
import com.crabcli.library.web.dto.BorrowDtos.LostRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 借书 / 还书 / 续借契约（BE-B08 / Issue #123、BE-B10 / Issue #125、BE-B11 / Issue #126）：
 * {@code POST /api/borrows} → 201 返回创建的借阅记录（status=BORROWED，dueAt 按
 * 读者类型借期）；规则拒绝见 {@code BorrowRuleValidator} 的 409 错误码契约，缺失
 * 引用 404。{@code POST /api/borrows/{id}/return} → 200 返回还书后的记录
 * （status=RETURNED、returnedAt=当日；有排队预约时同事务递补队首 WAITING → HELD），
 * 404 BORROW_NOT_FOUND、非在借再还 409 BORROW_NOT_ACTIVE。
 * {@code PUT /api/borrows/{id}/renew} → 200 返回续借后的借阅记录（dueAt 原到期日
 * 顺延、renewCount 变 1）；规则拒绝码见 {@code RenewService}（404 BORROW_NOT_FOUND /
 * 409 BORROW_NOT_ACTIVE、RENEW_BLOCKED_BY_OVERDUE、RENEW_LIMIT_REACHED、
 * RENEW_BLOCKED_BY_RESERVATION）。
 * {@code POST /api/borrows/{id}/lost} → 200 返回登记丢失后的借阅记录（status=LOST、
 * compensationStatus=PENDING、compensationAmount 已记录；LOST 未赔仍计配额与占用
 * [假设 A8]），404 BORROW_NOT_FOUND、非在借再登记 409 BORROW_NOT_ACTIVE、金额非法
 * 400 VALIDATION_ERROR。
 * {@code POST /api/borrows/{id}/compensate} → 200 返回结算后的借阅记录（status=LOST_PAID、
 * compensationStatus=PAID，闭环），404 BORROW_NOT_FOUND、重复结算 409
 * COMPENSATION_ALREADY_PAID、非丢失待赔 409 BORROW_NOT_ACTIVE。规则与写路径见
 * {@code LostCompensationService}。
 * 鉴权由 SecurityConfig 既有规则覆盖（#118：borrows 写 LIBRARIAN/ADMIN，
 * PUT /api/borrows/** 恰好承接续借路由），这里不再重复。
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

    @PutMapping("/api/borrows/{id}/renew")
    public ResponseEntity<BorrowRecord> renew(@PathVariable int id) {
        return ResponseEntity.ok(service.renew(id));
    }

    @PostMapping("/api/borrows/{id}/lost")
    public BorrowRecord markLost(@PathVariable int id, @Valid @RequestBody LostRequest request) {
        return service.markLost(id, request.compensationAmount());
    }

    @PostMapping("/api/borrows/{id}/compensate")
    public BorrowRecord compensate(@PathVariable int id) {
        return service.compensate(id);
    }
}
