package com.crabcli.library.service;

import com.crabcli.library.domain.Category;
import com.crabcli.library.domain.ReaderType;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.CategoryRepository;
import com.crabcli.library.repo.ReaderTypeRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.stereotype.Service;

/**
 * 基础数据维护（BE-B04 / Issue #119）：读者类型配额参数化 + 类别 CRUD。
 * <p>错误码约定（沿用 #117 统一错误体）：404 {@code READER_TYPE_NOT_FOUND} /
 * {@code CATEGORY_NOT_FOUND}；409 {@code DUPLICATE_CATEGORY} /
 * {@code CATEGORY_IN_USE}。重复名以 idx_categories_name 唯一索引兜底，
 * 服务层把约束违约转成 409（并发下两条同路径同归 409）。
 */
@Service
public class BaseDataService {

    private final ReaderTypeRepository readerTypeRepository;
    private final CategoryRepository categoryRepository;

    public BaseDataService(ReaderTypeRepository readerTypeRepository, CategoryRepository categoryRepository) {
        this.readerTypeRepository = readerTypeRepository;
        this.categoryRepository = categoryRepository;
    }

    public List<ReaderType> listReaderTypes() {
        return readerTypeRepository.findAll();
    }

    /**
     * 部分更新配额（F11）：只传 maxBorrow 或只传 loanWeeks 均可，未传字段保持原值；
     * 返回更新后重读的行，证明已落库。借阅业务每次经仓储实时读取，PUT 后立即生效。
     */
    public ReaderType updateReaderType(String code, Integer maxBorrow, Integer loanWeeks) {
        if (maxBorrow == null && loanWeeks == null) {
            throw new ApiException("VALIDATION_ERROR", "至少提供 maxBorrow 或 loanWeeks 之一",
                    HttpStatus.BAD_REQUEST);
        }
        ReaderType existing = requireReaderType(code);
        readerTypeRepository.updateQuota(code, maxBorrow, loanWeeks);
        return readerTypeRepository.findByCode(code).orElse(existing);
    }

    public List<Category> listCategories() {
        return categoryRepository.findAll();
    }

    public Category createCategory(String name) {
        try {
            return new Category(categoryRepository.insert(name), name);
        } catch (UncategorizedSQLException e) {
            throw translated(e, name);
        }
    }

    public Category renameCategory(int id, String name) {
        Category existing = requireCategory(id);
        try {
            categoryRepository.rename(id, name);
        } catch (UncategorizedSQLException e) {
            throw translated(e, name);
        }
        return new Category(existing.id(), name);
    }

    public void deleteCategory(int id) {
        requireCategory(id);
        if (categoryRepository.countBooksReferencing(id) > 0) {
            throw new ApiException("CATEGORY_IN_USE", "类别已被书籍引用，无法删除", HttpStatus.CONFLICT);
        }
        categoryRepository.deleteById(id);
    }

    private ReaderType requireReaderType(String code) {
        return readerTypeRepository.findByCode(code)
                .orElseThrow(() -> new ApiException("READER_TYPE_NOT_FOUND", "读者类型不存在",
                        HttpStatus.NOT_FOUND));
    }

    private Category requireCategory(int id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ApiException("CATEGORY_NOT_FOUND", "类别不存在",
                        HttpStatus.NOT_FOUND));
    }

    private ApiException duplicateCategory(String name) {
        return new ApiException("DUPLICATE_CATEGORY", "类别名已存在：" + name, HttpStatus.CONFLICT);
    }

    /**
     * 唯一索引违约（idx_categories_name）→ 409；其余 SQL 异常原样上抛。
     * <p>【实测】spring-jdbc 6.2.9 未给 SQLite 配置 duplicateKeyCodes，约束违约
     * 落为 {@link UncategorizedSQLException}（error code 19，SQLITE_CONSTRAINT_UNIQUE），
     * 不翻译成 DuplicateKeyException——故以 driver message 判别，判据与
     * LibrarySchemaTest 的唯一索引断言（"UNIQUE constraint failed"）同源。
     */
    private ApiException translated(UncategorizedSQLException e, String name) {
        if (e.getMessage() != null && e.getMessage().contains("UNIQUE constraint failed")) {
            return duplicateCategory(name);
        }
        throw e;
    }
}
