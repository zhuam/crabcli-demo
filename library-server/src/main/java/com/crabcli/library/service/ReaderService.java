package com.crabcli.library.service;

import com.crabcli.library.domain.Reader;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.ReaderRepository;
import com.crabcli.library.repo.ReaderTypeRepository;
import com.crabcli.library.web.dto.ReaderDtos.CreateRequest;
import com.crabcli.library.web.dto.ReaderDtos.ReaderPage;
import com.crabcli.library.web.dto.ReaderDtos.UpdateRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.stereotype.Service;

/**
 * 读者档案业务（BE-B05 / Issue #120）：新建 / 组合查询 / 修改 / 注销。
 * <p>错误码（沿用 #117 统一错误体）：404 {@code READER_NOT_FOUND} /
 * {@code READER_TYPE_NOT_FOUND}；409 {@code DUPLICATE_CARD_NO}。
 * 重复证号以 idx_readers_card_no 唯一索引兜底，服务层把约束违约转成 409
 * （并发下两条同路径同归 409，判据同 BaseDataService）。
 * <p>分页钳制（#115 契约，api.js 注明「由后端钳制」）：page 从 1 起、
 * size 缺省 10、上限 100，响应回显钳后生效值。
 */
@Service
public class ReaderService {

    /** 验收用例「建普通读者」：未显式传 readerTypeCode 时落 NORMAL。 */
    private static final String DEFAULT_READER_TYPE = "NORMAL";
    private static final int DEFAULT_SIZE = 10;
    private static final int MAX_SIZE = 100;

    private final ReaderRepository readerRepository;
    private final ReaderTypeRepository readerTypeRepository;

    public ReaderService(ReaderRepository readerRepository, ReaderTypeRepository readerTypeRepository) {
        this.readerRepository = readerRepository;
        this.readerTypeRepository = readerTypeRepository;
    }

    public Reader create(CreateRequest request) {
        String cardNo = request.cardNo().trim();
        String readerTypeCode = request.readerTypeCode() == null || request.readerTypeCode().isBlank()
                ? DEFAULT_READER_TYPE
                : request.readerTypeCode();
        // 写路径前置校验：reader_types 不存在时让请求 404 落在业务语义上，
        // 而不是 FK 约束的 500（读路径由 repo 的 JOIN 天然兜住）
        requireReaderType(readerTypeCode);
        int id;
        try {
            id = readerRepository.insert(cardNo, request.name().trim(), readerTypeCode,
                    request.phone(), request.email());
        } catch (UncategorizedSQLException e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE constraint failed")) {
                throw new ApiException("DUPLICATE_CARD_NO", "读者证号已存在：" + cardNo,
                        HttpStatus.CONFLICT);
            }
            throw e;
        }
        return requireReader(id);
    }

    public ReaderPage search(String q, String readerTypeCode, String status, Integer page, Integer size) {
        int effectivePage = page == null || page < 1 ? 1 : page;
        int effectiveSize = size == null || size < 1 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
        List<Reader> items = readerRepository.search(q, readerTypeCode, status,
                effectiveSize, (long) (effectivePage - 1) * effectiveSize);
        long total = readerRepository.count(q, readerTypeCode, status);
        return new ReaderPage(items, total, effectivePage, effectiveSize);
    }

    public Reader update(int id, UpdateRequest request) {
        requireReader(id);
        requireReaderType(request.readerTypeCode());
        readerRepository.updateProfile(id, request.name().trim(), request.phone(), request.email(),
                request.readerTypeCode());
        return requireReader(id);
    }

    /**
     * 注销（F1 / [假设 B4]）：恒成功，即使有未还图书——不校验在借计数，
     * 档案置 INACTIVE、历史借阅记录保留；重复注销幂等，同落 200。
     */
    public Reader deactivate(int id) {
        requireReader(id);
        readerRepository.markInactive(id);
        return requireReader(id);
    }

    private Reader requireReader(int id) {
        return readerRepository.findById(id)
                .orElseThrow(() -> new ApiException("READER_NOT_FOUND", "读者不存在", HttpStatus.NOT_FOUND));
    }

    private void requireReaderType(String code) {
        readerTypeRepository.findByCode(code)
                .orElseThrow(() -> new ApiException("READER_TYPE_NOT_FOUND", "读者类型不存在",
                        HttpStatus.NOT_FOUND));
    }
}
