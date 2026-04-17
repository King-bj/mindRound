; 安装结束时在安装目录旁创建 data/personae（与 exe 同级），与运行时 resolve_content_root 一致。
; 不覆盖已有 data（升级或用户已使用时跳过）。
; Windows 下 Tauri resource_dir 为 exe 所在目录，bundle.resources 会出现在 $INSTDIR\bundle-data\。

!macro NSIS_HOOK_POSTINSTALL
  ; 已有用户人物数据则不动
  IfFileExists "$INSTDIR\data\personae\*.*" skip_seed_data
  ; 构建打入的只读模板
  IfFileExists "$INSTDIR\bundle-data\personae\*.*" 0 skip_seed_data
    CreateDirectory "$INSTDIR\data"
    ; /E 子目录 /I 若目标不存在则视为目录 /Y 覆盖仅空目录场景
    nsExec::ExecToLog 'cmd /c xcopy "$INSTDIR\bundle-data\personae" "$INSTDIR\data\personae\" /E /I /Y /Q'
  skip_seed_data:
!macroend
