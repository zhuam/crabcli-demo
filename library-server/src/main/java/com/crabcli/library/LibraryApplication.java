package com.crabcli.library;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LibraryApplication {

    public static void main(String[] args) throws IOException {
        // sqlite-jdbc 只创建库文件、不创建父目录；首次 clone 后 data/ 不存在会直接启动失败。
        // 相对路径语义与 jdbc:sqlite:data/library.db 的 CWD 相对一致；已存在时此调用为幂等 no-op。
        Files.createDirectories(Path.of("data"));
        SpringApplication.run(LibraryApplication.class, args);
    }
}
