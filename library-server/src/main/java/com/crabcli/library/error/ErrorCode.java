package com.crabcli.library.error;

import org.springframework.http.HttpStatus;

/**
 * 框架级错误码登记处（BE-B02，契约 §2.1/§2.6）。
 * <p>业务错误码（BOOK_NOT_FOUND 等）由 #118+ 业务层直接以
 * {@code new ApiException(code, message, httpStatus)} 传入，不在此登记。
 */
public enum ErrorCode {

    /** 请求参数校验失败（MethodArgumentNotValidException）。 */
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),

    /** 未捕获异常的统一出口，响应体不回显堆栈与类名。 */
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }
}
