package com.crabcli.library.error;

import org.springframework.http.HttpStatus;

/**
 * 业务异常统一载体（BE-B02）：业务层抛出后由 {@link GlobalExceptionHandler}
 * 平铺为 {@code {"code","message"}}，HTTP 状态码随实例透传。
 */
public class ApiException extends RuntimeException {

    private final String code;
    private final HttpStatus httpStatus;

    public ApiException(String code, String message, HttpStatus httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public String code() {
        return code;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }
}
