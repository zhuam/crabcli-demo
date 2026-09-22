package com.crabcli.library.web;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.service.ReservationService;
import com.crabcli.library.web.dto.ReservationDtos.ReservationRequest;
import com.crabcli.library.web.dto.ReservationDtos.ReservationView;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 预约契约（BE-B09 / Issue #124）：
 * <ul>
 *   <li>{@code POST /api/reservations} → 201 WAITING（含 queuePosition）；全部副本
 *       未借出等拒绝码见 {@code ReservationService} 校验链；</li>
 *   <li>{@code POST /api/reservations/{id}/cancel} → 200 CANCELLED（HELD 取消释放
 *       副本并递补下一位 WAITING）；READER 仅本人（服务端校验归属，403 FORBIDDEN），
 *       SecurityConfig 对本路由放行至 authenticated；</li>
 *   <li>{@code GET /api/reservations} → 200 列表（入口先惰性结算，状态永不过期）。
 *       READER 仅本人（服务层钉定 readerId，显式传他人 403 FORBIDDEN，WEB-8 /
 *       #139 自助页；SecurityConfig 对 GET 放行至 authenticated）。
 *       后续 GET /api/borrows（#127）入口同款接入 ReservationExpirySweeper。</li>
 * </ul>
 * 建预约沿用馆员规则（LIBRARIAN/ADMIN）；取消与查询在 SecurityConfig 例外放行后
 * 由服务层按角色收权。
 */
@RestController
public class ReservationController {

    private final ReservationService service;

    public ReservationController(ReservationService service) {
        this.service = service;
    }

    @PostMapping("/api/reservations")
    public ResponseEntity<ReservationView> create(@Valid @RequestBody ReservationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PostMapping("/api/reservations/{id}/cancel")
    public ReservationView cancel(@PathVariable int id, @AuthenticationPrincipal LoginUser actor) {
        return service.cancel(id, actor);
    }

    @GetMapping("/api/reservations")
    public List<ReservationView> list(@AuthenticationPrincipal LoginUser actor,
                                      @RequestParam(required = false) Integer readerId,
                                      @RequestParam(required = false) Integer bookId,
                                      @RequestParam(required = false) String status) {
        return service.list(actor, readerId, bookId, status);
    }
}
