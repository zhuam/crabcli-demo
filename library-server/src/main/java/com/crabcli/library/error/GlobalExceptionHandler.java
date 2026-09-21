package com.crabcli.library.error;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常出口（BE-B02）：四类异常统一落成 {@link ErrorResponse}。
 * <ul>
 *   <li>{@link ApiException} —— 业务异常，状态码与 code/message 透传；</li>
 *   <li>{@link MethodArgumentNotValidException} —— 400 VALIDATION_ERROR + fields[]；</li>
 *   <li>请求本体/媒体类型/路径参数类型的边界畸形（BE-B04 / #119 端点接受 JSON 体与
 *       路径参数后引入）—— 400 VALIDATION_ERROR，客户端错误不得落 500；</li>
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

    /** 请求体缺失或非法 JSON（#119 端点边界）：400，不落 500。 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException ex) {
        return badRequest("请求体缺失或格式非法");
    }

    /** Content-Type 缺失/不支持（#119 端点只收 JSON）：按契约并入 400 VALIDATION_ERROR。 */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
        return badRequest("Content-Type 需为 application/json");
    }

    /** 路径参数类型不符（如 /api/categories/abc）：400，不落 500。 */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return badRequest("路径参数类型非法");
    }

    private static ResponseEntity<ErrorResponse> badRequest(String message) {
        return ResponseEntity.badRequest()
                .body(new ErrorResponse(ErrorCode.VALIDATION_ERROR.name(), message, null));
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
