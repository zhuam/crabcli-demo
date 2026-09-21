package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * BE-B05 验收（Issue #120）：读者管理 CRUD 与注销逐条自证。
 * <ul>
 *   <li>POST 建普通读者 → 201，GET ?q=&lt;证号&gt; 可见且 maxBorrow=3（验收 1）；</li>
 *   <li>重复 cardNo 409 DUPLICATE_CARD_NO；q 模糊 + 过滤 + 分页 total 过滤后总数（验收 2）；</li>
 *   <li>deactivate 恒成功 status=INACTIVE，即使有未还图书（验收 3）；</li>
 *   <li>activeBorrowCount 口径：BORROWING + 未赔 LOST 计入，已赔 LOST/已还 不计（验收 4）。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：自建数据用唯一 cardNo/bookCode，
 * finally 按外键依赖序清理（borrow_records → readers / books），种子 R0001 不动。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class ReaderControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void postCreatesNormalReader201AndQShowsMaxBorrow3() throws Exception {
        String cardNo = uniqueCardNo();
        try {
            MvcResult created = mockMvc.perform(post("/api/readers")
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"cardNo\":\"" + cardNo + "\",\"name\":\"验收读者甲\"}"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.cardNo").value(cardNo))
                    .andExpect(jsonPath("$.readerTypeCode").value("NORMAL"))
                    .andExpect(jsonPath("$.status").value("ACTIVE"))
                    .andExpect(jsonPath("$.maxBorrow").value(3))
                    .andExpect(jsonPath("$.activeBorrowCount").value(0))
                    .andExpect(jsonPath("$.id").isNumber())
                    .andReturn();

            int id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asInt();

            // 验收 1 后半：GET ?q=<证号> 可见且 maxBorrow=3（配额实时读 reader_types，#119）
            mockMvc.perform(get("/api/readers?q=" + cardNo)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].id").value(id))
                    .andExpect(jsonPath("$.items[0].maxBorrow").value(3));
        } finally {
            cleanupReader(cardNo);
        }
    }

    @Test
    void postDuplicateCardNoIs409() throws Exception {
        String cardNo = uniqueCardNo();
        try {
            createReader(cardNo, "验收读者乙");

            mockMvc.perform(post("/api/readers")
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"cardNo\":\"" + cardNo + "\",\"name\":\"重复证号读者\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_CARD_NO"))
                    .andExpect(jsonPath("$.message").isNotEmpty());
        } finally {
            cleanupReader(cardNo);
        }
    }

    @Test
    void postBlankCardNoOrNameIs400WithFieldErrors() throws Exception {
        mockMvc.perform(post("/api/readers")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"cardNo\":\"  \",\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields.length()").value(2));
    }

    @Test
    void postUnknownReaderTypeIs404() throws Exception {
        mockMvc.perform(post("/api/readers")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"cardNo\":\"" + uniqueCardNo() + "\",\"name\":\"类型不存在\","
                                + "\"readerTypeCode\":\"NOPE\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("READER_TYPE_NOT_FOUND"));
    }

    @Test
    void searchQFuzzyMatchesCardNoAndName() throws Exception {
        String cardNoA = uniqueCardNo();
        String cardNoB = uniqueCardNo();
        try {
            createReader(cardNoA, "模糊查询张三");
            createReader(cardNoB, "李四");

            // q 对 cardNo 模糊命中（取尾部 8 位：nanoTime 低位才是两证号真正不同的段）
            mockMvc.perform(get("/api/readers?q=" + cardNoA.substring(cardNoA.length() - 8))
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].cardNo").value(cardNoA));

            // q 对 name 模糊命中
            mockMvc.perform(get("/api/readers?q=模糊查询")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].cardNo").value(cardNoA));
        } finally {
            cleanupReader(cardNoA);
            cleanupReader(cardNoB);
        }
    }

    @Test
    void searchFiltersByTypeAndStatusTotalIsFilteredCount() throws Exception {
        String normalCard = uniqueCardNo();
        String teacherCard = uniqueCardNo();
        try {
            int normalId = createReader(normalCard, "过滤测试普通");
            createReaderWithType(teacherCard, "过滤测试教师", "TEACHER");

            // readerTypeCode 过滤：仅 NORMAL 命中
            mockMvc.perform(get("/api/readers?readerTypeCode=NORMAL&q=" + normalCard)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].cardNo").value(normalCard));

            // TEACHER 命中教师，maxBorrow=6 随类型实时读数
            mockMvc.perform(get("/api/readers?readerTypeCode=TEACHER&q=" + teacherCard)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].maxBorrow").value(6));

            // status 过滤：INACTIVE 排除两名 ACTIVE 读者
            mockMvc.perform(get("/api/readers?status=INACTIVE&q=" + normalCard.substring(normalCard.length() - 8))
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(0))
                    .andExpect(jsonPath("$.items").isEmpty());

            // 注销 NORMAL 后 status=INACTIVE 过滤可见（total 仍为过滤后总数）
            deactivate(normalId);
            mockMvc.perform(get("/api/readers?status=INACTIVE&q=" + normalCard.substring(normalCard.length() - 8))
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].status").value("INACTIVE"));
        } finally {
            cleanupReader(normalCard);
            cleanupReader(teacherCard);
        }
    }

    @Test
    void paginationClampsAndEchoesEffectivePageAndSize() throws Exception {
        String cardNo = uniqueCardNo();
        try {
            createReader(cardNo, "分页测试读者");

            // size>100 钳到 100；page<1 钳到 1；响应回显钳后生效值，total 不随分页缩放
            mockMvc.perform(get("/api/readers?q=" + cardNo + "&page=0&size=500")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.page").value(1))
                    .andExpect(jsonPath("$.size").value(100))
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items.length()").value(1));

            // 缺省分页：page=1，size 落默认 10
            mockMvc.perform(get("/api/readers?q=" + cardNo)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.page").value(1))
                    .andExpect(jsonPath("$.size").value(10));

            // 第二页超出命中范围：items 空、total 仍为过滤后总数
            mockMvc.perform(get("/api/readers?q=" + cardNo + "&page=2")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.page").value(2))
                    .andExpect(jsonPath("$.items").isEmpty())
                    .andExpect(jsonPath("$.total").value(1));
        } finally {
            cleanupReader(cardNo);
        }
    }

    @Test
    void putUpdatesProfileAndKeepsCardNo() throws Exception {
        String cardNo = uniqueCardNo();
        try {
            int id = createReader(cardNo, "修改前姓名");

            mockMvc.perform(put("/api/readers/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"name\":\"修改后姓名\",\"readerTypeCode\":\"NORMAL\","
                                    + "\"phone\":\"13800000000\",\"email\":\"reader@test.dev\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id))
                    .andExpect(jsonPath("$.cardNo").value(cardNo))
                    .andExpect(jsonPath("$.name").value("修改后姓名"))
                    .andExpect(jsonPath("$.phone").value("13800000000"))
                    .andExpect(jsonPath("$.email").value("reader@test.dev"));

            // 修改落到库（响应不是回声）；证号是身份键不可改
            assertThat(jdbc.queryForObject(
                    "SELECT name FROM readers WHERE id = ?", String.class, id)).isEqualTo("修改后姓名");
            assertThat(jdbc.queryForObject(
                    "SELECT card_no FROM readers WHERE id = ?", String.class, id)).isEqualTo(cardNo);
        } finally {
            cleanupReader(cardNo);
        }
    }

    @Test
    void unknownReaderIs404OnPutAndDeactivate() throws Exception {
        mockMvc.perform(put("/api/readers/999999")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"name\":\"幽灵\",\"readerTypeCode\":\"NORMAL\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("READER_NOT_FOUND"));

        mockMvc.perform(post("/api/readers/999999/deactivate")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("READER_NOT_FOUND"));
    }

    @Test
    void deactivateSucceedsEvenWithUnreturnedBooks() throws Exception {
        String cardNo = uniqueCardNo();
        String bookCode = uniqueBookCode();
        try {
            int readerId = createReader(cardNo, "注销测试读者");
            int bookId = insertBook(bookCode);
            // 未还借阅：BORROWING 在架外借中（F3 实体域 #122 未交付，直接落表模拟）
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status) "
                            + "VALUES (?, ?, '2026-09-14T00:00:00.000Z', '2026-10-12T00:00:00.000Z', 'BORROWING')",
                    readerId, bookId);

            // 验收 3：有未还图书仍恒成功 → 200 且 status=INACTIVE
            mockMvc.perform(post("/api/readers/" + readerId + "/deactivate")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(readerId))
                    .andExpect(jsonPath("$.status").value("INACTIVE"))
                    // 未还记录保留：在借计数不因注销清零，前端直接消费
                    .andExpect(jsonPath("$.activeBorrowCount").value(1));

            // 落库而非回声
            assertThat(jdbc.queryForObject(
                    "SELECT status FROM readers WHERE id = ?", String.class, readerId)).isEqualTo("INACTIVE");
        } finally {
            cleanupReader(cardNo);
            cleanupBook(bookCode);
        }
    }

    @Test
    void deactivateIsIdempotent() throws Exception {
        String cardNo = uniqueCardNo();
        try {
            int readerId = createReader(cardNo, "幂等注销读者");

            deactivate(readerId);
            // 恒成功 [假设 B4]：重复注销同落 200，状态保持 INACTIVE
            mockMvc.perform(post("/api/readers/" + readerId + "/deactivate")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("INACTIVE"));
        } finally {
            cleanupReader(cardNo);
        }
    }

    @Test
    void activeBorrowCountCountsBorrowingAndUnpaidLostOnly() throws Exception {
        String cardNo = uniqueCardNo();
        String bookCode = uniqueBookCode();
        try {
            int readerId = createReader(cardNo, "口径测试读者");
            int bookId = insertBook(bookCode);

            // 契约状态 → 存储行：BORROWED/OVERDUE=BORROWING（逾期实时算）；
            // LOST=LOST+未赔（计入）；LOST_PAID=LOST+PAID（不计）；RETURNED 不计
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status) "
                    + "VALUES (?, ?, '2026-09-14T00:00:00.000Z', '2026-10-12T00:00:00.000Z', 'BORROWING')",
                    readerId, bookId);
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status) "
                    + "VALUES (?, ?, '2026-09-01T00:00:00.000Z', '2026-09-29T00:00:00.000Z', 'BORROWING')",
                    readerId, bookId);
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status, "
                    + "compensation_status) VALUES (?, ?, '2026-08-01T00:00:00.000Z', "
                    + "'2026-08-29T00:00:00.000Z', 'LOST', 'UNPAID')", readerId, bookId);
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status, "
                    + "compensation_status) VALUES (?, ?, '2026-07-01T00:00:00.000Z', "
                    + "'2026-07-29T00:00:00.000Z', 'LOST', 'PAID')", readerId, bookId);
            jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status, "
                    + "returned_at) VALUES (?, ?, '2026-06-01T00:00:00.000Z', "
                    + "'2026-06-29T00:00:00.000Z', 'RETURNED', '2026-06-20T00:00:00.000Z')", readerId, bookId);

            // 验收 4：BORROWING×2 + 未赔 LOST×1 计入；已赔 LOST 与已还不计 → 3
            mockMvc.perform(get("/api/readers?q=" + cardNo)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].activeBorrowCount").value(3));
        } finally {
            cleanupReader(cardNo);
            cleanupBook(bookCode);
        }
    }

    @Test
    void readerRoleIs403OnReaderManagement() throws Exception {
        // 读者管理是馆员域：READER 角色写操作 403（矩阵口径 #118，GET 同被收紧）
        mockMvc.perform(post("/api/readers")
                        .header("Authorization", "Bearer " + tokenFor("reader01"))
                        .contentType("application/json")
                        .content("{\"cardNo\":\"" + uniqueCardNo() + "\",\"name\":\"越权读者\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    // ---------- 基建 ----------

    private int createReader(String cardNo, String name) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/readers")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"cardNo\":\"" + cardNo + "\",\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asInt();
    }

    private void createReaderWithType(String cardNo, String name, String readerTypeCode) throws Exception {
        mockMvc.perform(post("/api/readers")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"cardNo\":\"" + cardNo + "\",\"name\":\"" + name + "\","
                                + "\"readerTypeCode\":\"" + readerTypeCode + "\"}"))
                .andExpect(status().isCreated());
    }

    private void deactivate(int readerId) throws Exception {
        mockMvc.perform(post("/api/readers/" + readerId + "/deactivate")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk());
    }

    private int insertBook(String bookCode) {
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "SELECT ?, ?, ?, id, 1 FROM categories WHERE name = '计算机技术'",
                bookCode, "口径测试书", "测试作者");
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, bookCode);
    }

    private void cleanupReader(String cardNo) {
        List<Integer> ids = jdbc.queryForList(
                "SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
        for (Integer id : ids) {
            jdbc.update("DELETE FROM borrow_records WHERE reader_id = ?", id);
            jdbc.update("DELETE FROM readers WHERE id = ?", id);
        }
    }

    private void cleanupBook(String bookCode) {
        jdbc.update("DELETE FROM books WHERE book_code = ?", bookCode);
    }

    private String uniqueCardNo() {
        return "T" + System.nanoTime();
    }

    private String uniqueBookCode() {
        return "B-" + System.nanoTime();
    }

    private String adminToken() throws Exception {
        return tokenFor("admin");
    }

    private String tokenFor(String username) throws Exception {
        String password = switch (username) {
            case "admin" -> "admin123";
            case "reader01" -> "reader123";
            default -> throw new IllegalArgumentException("未知测试账号 " + username);
        };
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }
}
