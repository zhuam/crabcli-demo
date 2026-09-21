package com.crabcli.library.web.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * 读者管理请求 DTO 家族（BE-B05 / Issue #120）。响应体直接序列化
 * {@code domain.Reader}（含派生读数 maxBorrow/activeBorrowCount），此处只收请求。
 */
public final class ReaderDtos {

    private ReaderDtos() {
    }

    /** 新建读者请求：readerTypeCode 缺省 NORMAL（验收用例「建普通读者」）。 */
    public record CreateRequest(@NotBlank(message = "借书证号不能为空") String cardNo,
                                @NotBlank(message = "读者姓名不能为空") String name,
                                String readerTypeCode,
                                String phone,
                                String email) {
    }

    /** 修改读者请求：全量更新档案字段；证号是身份键不可改，status 仅经注销端点流转。 */
    public record UpdateRequest(@NotBlank(message = "读者姓名不能为空") String name,
                                @NotBlank(message = "读者类型不能为空") String readerTypeCode,
                                String phone,
                                String email) {
    }

    /**
     * 分页响应（契约 #115：{items,total,page,size}，page 从 1 起、size 上限 100）。
     * page/size 为服务端钳制后的生效值，total 为过滤后命中总数。
     */
    public record ReaderPage(List<com.crabcli.library.domain.Reader> items,
                             long total, int page, int size) {
    }
}
