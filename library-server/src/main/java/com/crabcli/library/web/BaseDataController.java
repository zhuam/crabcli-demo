package com.crabcli.library.web;

import com.crabcli.library.domain.Category;
import com.crabcli.library.domain.ReaderType;
import com.crabcli.library.service.BaseDataService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 基础数据维护契约（BE-B04 / Issue #119）：
 * <ul>
 *   <li>{@code GET /api/reader-types}：非分页 {@code {items:[{code,name,maxBorrow,loanWeeks}]}}；</li>
 *   <li>{@code PUT /api/reader-types/{code}}：部分更新配额 {@code {maxBorrow?,loanWeeks?}} → 200 返回更新后的行；</li>
 *   <li>{@code GET /api/categories}：非分页 {@code {items:[{id,name}]}}；</li>
 *   <li>{@code POST /api/categories {name}} → 200 返回新建类别；重复名 409 DUPLICATE_CATEGORY；</li>
 *   <li>{@code PUT /api/categories/{id} {name}} → 200；</li>
 *   <li>{@code DELETE /api/categories/{id}} → 204；被书籍引用 409 CATEGORY_IN_USE。</li>
 * </ul>
 * 鉴权由 SecurityConfig 既有规则覆盖（#118）：写 ADMIN，读 authenticated，这里不再重复。
 */
@RestController
public class BaseDataController {

    /** GET 列表响应：非分页 items 包装。 */
    public record ReaderTypeList(List<ReaderType> items) {
    }

    /** GET 列表响应：非分页 items 包装。 */
    public record CategoryList(List<Category> items) {
    }

    /** 配额更新请求：两字段均可选，null = 保持原值。 */
    public record ReaderTypeUpdate(@Min(value = 1, message = "册数至少为 1") Integer maxBorrow,
                                   @Min(value = 1, message = "借期至少为 1 周") Integer loanWeeks) {
    }

    /** 类别新建/重命名请求。 */
    public record CategoryRequest(@NotBlank(message = "类别名不能为空") String name) {
    }

    private final BaseDataService service;

    public BaseDataController(BaseDataService service) {
        this.service = service;
    }

    @GetMapping("/api/reader-types")
    public ReaderTypeList readerTypes() {
        return new ReaderTypeList(service.listReaderTypes());
    }

    @PutMapping("/api/reader-types/{code}")
    public ReaderType updateReaderType(@PathVariable String code,
                                       @Valid @RequestBody ReaderTypeUpdate request) {
        return service.updateReaderType(code, request.maxBorrow(), request.loanWeeks());
    }

    @GetMapping("/api/categories")
    public CategoryList categories() {
        return new CategoryList(service.listCategories());
    }

    @PostMapping("/api/categories")
    public Category createCategory(@Valid @RequestBody CategoryRequest request) {
        return service.createCategory(request.name().trim());
    }

    @PutMapping("/api/categories/{id}")
    public Category renameCategory(@PathVariable int id, @Valid @RequestBody CategoryRequest request) {
        return service.renameCategory(id, request.name().trim());
    }

    @DeleteMapping("/api/categories/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable int id) {
        service.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }
}
