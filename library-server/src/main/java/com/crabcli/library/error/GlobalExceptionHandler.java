package com.crabcli.library.error;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常出口（BE-B02）：四类异常统一落成 {@link ErrorResponse}。
 * <ul>
 *   <li>{@link ApiException} —— 业务异常，状态码与 code/message 透传；</li>
 *   <li>{@link MethodArgumentNotValidException} —— 400 VALIDATION_ERROR + fields[]；</li>
 *   <li>{@link NoResourceFoundException} —— 未注册接口 404 NOT_FOUND
 *       （BE-B03 鉴权矩阵以「放行到 404」证明安全链畅通，不能落 500）；</li>
 *   <li>其余未捕获异常 —— 500 INTERNAL_ERROR，【安全】响应体不回显堆栈与类名，
 *       仅服务端日志留痕。</li>
 * </ul>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.httpStatus())
                .body(new ErrorResponse(ex.code(), ex.getMessage(), null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<ErrorResponse.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ErrorResponse.FieldError(fe.getField(), fe.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest()
                .body(new ErrorResponse(ErrorCode.VALIDATION_ERROR.name(), "请求参数校验失败", fields));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("NOT_FOUND", "接口不存在", null));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        log.error("未捕获异常", ex);
        return ResponseEntity.internalServerError()
                .body(new ErrorResponse(ErrorCode.INTERNAL_ERROR.name(), "服务器内部错误", null));
    }
}
