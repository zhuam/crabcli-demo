package com.crabcli.library.error;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仅存在于测试源码的探针控制器：为 {@link GlobalExceptionHandlerTest}
 * 提供可控触发 ApiException / 未捕获异常 / 参数校验失败的入口。
 */
@RestController
@RequestMapping("/api/test-error-probe")
class ErrorProbeController {

    record ProbeRequest(
            @NotBlank(message = "书名不能为空") String title,
            @NotNull(message = "册数不能为空") @Min(value = 1, message = "册数至少为 1") Integer copies) {
    }

    @PostMapping("/api-exception")
    public Map<String, Object> apiException() {
        throw new ApiException("BOOK_NOT_FOUND", "书籍不存在", HttpStatus.NOT_FOUND);
    }

    @PostMapping("/unexpected")
    public Map<String, Object> unexpected() {
        throw new IllegalStateException("模拟未捕获异常-内部细节不应外泄");
    }

    @PostMapping("/validated")
    public Map<String, Object> validated(@Valid @RequestBody ProbeRequest request) {
        return Map.of("ok", true);
    }
}
