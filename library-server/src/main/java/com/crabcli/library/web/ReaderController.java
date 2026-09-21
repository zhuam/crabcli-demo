package com.crabcli.library.web;

import com.crabcli.library.domain.Reader;
import com.crabcli.library.service.ReaderService;
import com.crabcli.library.web.dto.ReaderDtos;
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
 * 读者管理契约（BE-B05 / Issue #120）：
 * <ul>
 *   <li>{@code POST /api/readers {cardNo,name,readerTypeCode?,phone?,email?}} → 201
 *       返回档案（readerTypeCode 缺省 NORMAL，maxBorrow 随类型实时读数）；
 *       重复证号 409 DUPLICATE_CARD_NO；</li>
 *   <li>{@code GET /api/readers?q=&readerTypeCode=&status=&page=&size=} →
 *       {@code {items,total,page,size}}，q 对证号/姓名模糊，total 为过滤后总数，
 *       page 从 1 起、size 上限 100（后端钳制，#115 契约）；</li>
 *   <li>{@code PUT /api/readers/{id} {name,readerTypeCode,phone,email}} → 200
 *       全量更新档案字段（证号是身份键不可改，status 仅经注销流转）；</li>
 *   <li>{@code POST /api/readers/{id}/deactivate} → 200 且 status=INACTIVE
 *       （恒成功，即使有未还图书 [假设 B4]；重复注销幂等）。</li>
 * </ul>
 * 响应档案含派生读数 maxBorrow / activeBorrowCount（口径见 domain.Reader），
 * 前端直接消费不自行统计。鉴权由 SecurityConfig 既有规则覆盖（#118）：
 * /api/readers/** 全方法 LIBRARIAN 或 ADMIN，这里不再重复。
 */
@RestController
public class ReaderController {

    private final ReaderService service;

    public ReaderController(ReaderService service) {
        this.service = service;
    }

    @PostMapping("/api/readers")
    public ResponseEntity<Reader> create(@Valid @RequestBody ReaderDtos.CreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @GetMapping("/api/readers")
    public ReaderDtos.ReaderPage search(@RequestParam(required = false) String q,
                                        @RequestParam(required = false) String readerTypeCode,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(required = false) Integer page,
                                        @RequestParam(required = false) Integer size) {
        return service.search(q, readerTypeCode, status, page, size);
    }

    @PutMapping("/api/readers/{id}")
    public Reader update(@PathVariable int id, @Valid @RequestBody ReaderDtos.UpdateRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/api/readers/{id}/deactivate")
    public Reader deactivate(@PathVariable int id) {
        return service.deactivate(id);
    }
}
