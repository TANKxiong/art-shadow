@echo off
cd /d "%~dp0"

echo 画影客 - 上传更新
echo ================

set /p msg="请输入这次的更新说明（如：修复了画笔BUG）："

if "%msg%"=="" set msg=日常更新

git add .
git commit -m "%msg%"
git push

echo.
echo 已提交！去 https://github.com/TANKxiong/art-shadow/actions 查看打包进度。
echo 打包完成后下载 ArtShadow-Portable 即可。
pause
