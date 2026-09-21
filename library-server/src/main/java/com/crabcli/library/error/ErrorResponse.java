package com.crabcli.library.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * 统一错误响应体（契约 §2.1/§2.6）：平铺 {@code {"code","message"}}；
 * 仅参数校验失败时附 {@code fields[]}（逐字段），其余场景 fields 键不出现在 JSON 里。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String code, String message, List<FieldError> fields) {

    public record FieldError(String field, String message) {
    }
}
