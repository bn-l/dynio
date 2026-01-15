use super::*;
use std::io::Cursor;
use tempfile::tempdir;

// Section 29: Unicode/International Character Handling Tests

// Test unicode path handling via trim_path command
mod path_operations {
    use super::*;

    #[tokio::test]
    async fn trim_path_handles_german_umlauts() {
        let path = "/home/user/über Voßstraße/file.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/home/user/über Voßstraße");
    }

    #[tokio::test]
    async fn trim_path_handles_french_accents() {
        let path = "/documents/l'hôpital/patient.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/documents/l'hôpital");
    }

    #[tokio::test]
    async fn trim_path_handles_cyrillic() {
        let path = "/данные/соответствующий/файл.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/данные/соответствующий");
    }

    #[tokio::test]
    async fn trim_path_handles_chinese() {
        let path = "/文档/--沃斯大街上---/文件.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/文档/--沃斯大街上---");
    }

    #[tokio::test]
    async fn trim_path_handles_mixed_scripts() {
        let path = "/home/über/日本語/кириллица/中文.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/home/über/日本語/кириллица");
    }

    #[tokio::test]
    async fn trim_path_handles_emoji_in_path() {
        let path = "/home/user/📁documents/🎉celebration.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/home/user/📁documents");
    }

    #[tokio::test]
    async fn trim_path_handles_combining_characters() {
        // Combining diacritical marks (e.g., é as e + combining acute accent)
        let path = "/home/café/naïve.txt".to_string();
        let result = trim_path(path).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/home/café");
    }
}

// Test JSON parsing with unicode content
mod json_unicode {
    use serde_json::{json, Value};

    #[test]
    fn json_parses_german_umlauts() {
        let json_str = r#"{"name": "über Voßstraße", "path": "/home/ü.txt"}"#;
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["name"], "über Voßstraße");
        assert_eq!(v["path"], "/home/ü.txt");
    }

    #[test]
    fn json_parses_cyrillic_text() {
        let json_str = r#"{"filename": "соответствующий.txt", "content": "Привет мир"}"#;
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["filename"], "соответствующий.txt");
        assert_eq!(v["content"], "Привет мир");
    }

    #[test]
    fn json_parses_chinese_text() {
        let json_str = r#"{"filename": "--沃斯大街上---.txt", "content": "你好世界"}"#;
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["filename"], "--沃斯大街上---.txt");
        assert_eq!(v["content"], "你好世界");
    }

    #[test]
    fn json_parses_japanese_text() {
        let json_str = r#"{"message": "こんにちは世界", "status": "成功"}"#;
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["message"], "こんにちは世界");
        assert_eq!(v["status"], "成功");
    }

    #[test]
    fn json_parses_mixed_unicode_array() {
        let json_str = r#"["über", "кириллица", "中文", "日本語", "l'hôpital"]"#;
        let parsed: Result<Vec<String>, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v.len(), 5);
        assert_eq!(v[0], "über");
        assert_eq!(v[1], "кириллица");
        assert_eq!(v[2], "中文");
        assert_eq!(v[3], "日本語");
        assert_eq!(v[4], "l'hôpital");
    }

    #[test]
    fn json_parses_unicode_escapes() {
        // JSON unicode escape sequences should be decoded
        let json_str = r#"{"text": "\u00FC\u00DF"}"#; // üß
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["text"], "üß");
    }

    #[test]
    fn json_roundtrip_preserves_unicode() {
        let original = json!({
            "german": "über Voßstraße",
            "russian": "соответствующий",
            "chinese": "沃斯大街",
            "french": "l'hôpital"
        });
        let serialized = serde_json::to_string(&original).unwrap();
        let deserialized: Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(original, deserialized);
    }

    #[test]
    fn json_handles_surrogate_pairs_for_emoji() {
        // Emoji that require surrogate pairs in JSON
        let json_str = r#"{"emoji": "🎉🚀🌍"}"#;
        let parsed: Result<Value, _> = serde_json::from_str(json_str);
        assert!(parsed.is_ok());
        let v = parsed.unwrap();
        assert_eq!(v["emoji"], "🎉🚀🌍");
    }
}

// Test stdout/stderr reading with various unicode scripts
mod stdout_unicode {
    use super::*;
    use tokio::io::BufReader;

    #[tokio::test]
    async fn read_lines_handles_arabic() {
        let data = "مرحبا بالعالم\nالسلام عليكم\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "مرحبا بالعالم");
        assert_eq!(result[1], "السلام عليكم");
    }

    #[tokio::test]
    async fn read_lines_handles_hebrew() {
        let data = "שלום עולם\nמה שלומך\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "שלום עולם");
        assert_eq!(result[1], "מה שלומך");
    }

    #[tokio::test]
    async fn read_lines_handles_korean() {
        let data = "안녕하세요\n세계\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "안녕하세요");
        assert_eq!(result[1], "세계");
    }

    #[tokio::test]
    async fn read_lines_handles_thai() {
        let data = "สวัสดีโลก\nภาษาไทย\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "สวัสดีโลก");
        assert_eq!(result[1], "ภาษาไทย");
    }

    #[tokio::test]
    async fn read_chunks_handles_mixed_scripts_in_single_chunk() {
        // Single chunk with multiple scripts
        let data = "über-кириллица-中文-日本語".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_chunks(reader, tx, finish_flag).await;

        let result = rx.borrow().clone();
        let joined: String = result.join("");
        assert_eq!(joined, "über-кириллица-中文-日本語");
    }

    #[tokio::test]
    async fn read_lines_handles_zero_width_characters() {
        // Zero-width joiner and non-joiner
        let data = "a\u{200D}b\u{200C}c\n".as_bytes();
        let cursor = Cursor::new(data.to_vec());
        let reader = BufReader::new(cursor);
        let lines = reader.lines();

        let (tx, rx) = watch::channel(Vec::<String>::new());
        let finish_flag = Arc::new(AtomicBool::new(false));

        read_and_send_lines(lines, tx, finish_flag).await;

        let result = rx.borrow().clone();
        assert_eq!(result.len(), 1);
        // The string should contain the zero-width characters
        assert!(result[0].len() > 3); // More than just "abc" due to zero-width chars
    }
}

// Test filesystem operations with unicode filenames (using tempfile)
#[cfg(any(target_os = "linux", target_os = "macos"))]
mod filesystem_unicode {
    use super::*;
    use std::fs;

    #[test]
    fn create_file_with_german_umlaut_filename() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("über Voßstraße.txt");

        fs::write(&file_path, "content").unwrap();

        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "content");
    }

    #[test]
    fn create_file_with_french_accent_filename() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("l'hôpital.txt");

        fs::write(&file_path, "medical").unwrap();

        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "medical");
    }

    #[test]
    fn create_file_with_cyrillic_filename() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("соответствующий.txt");

        fs::write(&file_path, "русский").unwrap();

        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "русский");
    }

    #[test]
    fn create_file_with_chinese_filename() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("--沃斯大街上---.txt");

        fs::write(&file_path, "中文内容").unwrap();

        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "中文内容");
    }

    #[test]
    fn list_directory_with_unicode_filenames() {
        let temp = tempdir().unwrap();

        // Create files with various unicode names
        let names = vec![
            "über.txt",
            "l'hôpital.txt",
            "соответствующий.txt",
            "沃斯大街.txt",
            "日本語.txt",
        ];

        for name in &names {
            let path = temp.path().join(name);
            fs::write(&path, "test").unwrap();
        }

        // List directory and verify all files are found
        let entries: Vec<_> = fs::read_dir(temp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        assert_eq!(entries.len(), 5);
        for name in &names {
            assert!(entries.contains(&name.to_string()), "Missing: {}", name);
        }
    }

    #[test]
    fn create_nested_unicode_directories() {
        let temp = tempdir().unwrap();
        let nested_path = temp.path()
            .join("über")
            .join("кириллица")
            .join("中文")
            .join("日本語");

        fs::create_dir_all(&nested_path).unwrap();

        assert!(nested_path.exists());
        assert!(nested_path.is_dir());
    }

    #[tokio::test]
    async fn trim_path_on_real_unicode_file() {
        let temp = tempdir().unwrap();
        let dir_path = temp.path().join("über Voßstraße");
        fs::create_dir(&dir_path).unwrap();

        let file_path = dir_path.join("file.txt");
        fs::write(&file_path, "content").unwrap();

        let result = trim_path(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().contains("über Voßstraße"));
    }
}

// Test ConfigFiles struct with unicode content
mod config_unicode {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct TestConfigFiles {
        cmd_config: String,
        settings: String,
    }

    #[test]
    fn config_files_serialize_unicode_content() {
        let config = TestConfigFiles {
            cmd_config: "name: über-command\npath: /über/path".to_string(),
            settings: "theme: тёмная\nlang: 中文".to_string(),
        };

        let serialized = serde_json::to_string(&config).unwrap();
        let deserialized: TestConfigFiles = serde_json::from_str(&serialized).unwrap();

        assert_eq!(config, deserialized);
    }

    #[test]
    fn yaml_parses_unicode_content() {
        let yaml_str = r#"
name: über-command
description: Команда с юникодом
tags:
  - 中文标签
  - 日本語タグ
  - тег
"#;
        let parsed: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();

        assert_eq!(parsed["name"], "über-command");
        assert_eq!(parsed["description"], "Команда с юникодом");

        let tags = parsed["tags"].as_sequence().unwrap();
        assert_eq!(tags[0], "中文标签");
        assert_eq!(tags[1], "日本語タグ");
        assert_eq!(tags[2], "тег");
    }
}
