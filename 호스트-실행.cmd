@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo 실행 파일이 없습니다. 압축을 전부 해제한 다음 실행하세요.
  pause
  exit /b 1
)
if not defined PVP_PORT set "PVP_PORT=8787"
echo 이누야샤 PvP 서버를 시작합니다.
echo 브라우저에서 http://localhost:%PVP_PORT% 를 여세요.
echo 상대에게는 게임 화면에 표시되는 서버 주소와 방 코드를 전달하세요.
echo.
"runtime\node.exe" "server\main.mjs"
echo.
echo 서버가 종료되었습니다.
pause
