package com.crabcli.library.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

/**
 * 借书契约 DTO（BE-B08 / Issue #123）：馆员操作台选读者、选书后按 id 提交借出。
 * 错误响应复用 BE-B02 统一错误体（平铺 {@code {"code","message"}}，中文直显）。
 */
public final class BorrowDtos {

    private BorrowDtos() {
    }

    /** 借出请求：readerId / bookId 均必填且为正数（缺失或非法在控制器边界 400）。 */
    public record BorrowRequest(
            @NotNull(message = "读者不能为空") @Positive(message = "读者 ID 非法") Integer readerId,
            @NotNull(message = "书籍不能为空") @Positive(message = "书籍 ID 非法") Integer bookId) {
    }

    /**
     * 丢失登记请求（BE-B13 / Issue #128）：赔偿金额必填且为正数（缺失 / 负数 / 零在
     * 控制器边界 400 VALIDATION_ERROR；非数字 JSON 由反序列化失败同样落 400，
     * 见 GlobalExceptionHandler 的 HttpMessageNotReadable 出口）。
     */
    public record LostRequest(
            @NotNull(message = "赔偿金额不能为空")
            @Positive(message = "赔偿金额必须为正数") BigDecimal compensationAmount) {
    }
}
