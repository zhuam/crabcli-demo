package com.crabcli.library.web;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.service.BorrowQueryService;
import com.crabcli.library.web.dto.BorrowQueryDtos.BorrowQueryPage;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 借阅查询契约（BE-B12 / Issue #127）：{@code GET /api/borrows} → 200
 * {@code {items,total,page,size}}，过滤条件 readerId / status / from / to 均可选
 * （from/to 对 borrowDate 闭区间）。READER 服务端强制仅本人（缺省即本人、显式传
 * 他人 403 FORBIDDEN，见 {@code BorrowQueryService}）；馆员 / 管理员可查任意。
 * 鉴权走 SecurityConfig blanket authenticated（#118 读操作暂统一 authenticated，
 * READER 收权在服务层），与 {@code POST /api/borrows}（BorrowController，写操作
 * LIBRARIAN/ADMIN）同路径不同方法，分属两个控制器按 issue 涉及文件交付。
 * 日期参数非法（非 ISO yyyy-MM-dd）→ 400 VALIDATION_ERROR（既有
 * MethodArgumentTypeMismatch 出口）。
 */
@RestController
public class BorrowQueryController {

    private final BorrowQueryService service;

    public BorrowQueryController(BorrowQueryService service) {
        this.service = service;
    }

    @GetMapping("/api/borrows")
    public BorrowQueryPage search(@AuthenticationPrincipal LoginUser actor,
                                  @RequestParam(required = false) Integer readerId,
                                  @RequestParam(required = false) String status,
                                  @RequestParam(required = false)
                                  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam(required = false)
                                  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                  @RequestParam(defaultValue = "1") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return service.search(actor, readerId, status, from, to, page, size);
    }
}
