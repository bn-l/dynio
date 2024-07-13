@echo off
setlocal enabledelayedexpansion

:: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
:: !!!! MAKE SURE to paste your openai api key below !!!!
:: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

:: Check for the required argument
if "%~1"=="" (
    echo Usage: %~nx0 "Your message here"
    exit /b 1
)

:: Prepare the JSON payload with the provided argument
set "USER_MESSAGE=%~1"

:: Prepare the JSON payload, escaping double quotes
set "JSON_PAYLOAD={\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"system\", \"content\": [{\"type\": \"text\", \"text\": \"You are a helpful assistant. \"}]}, {\"role\": \"user\", \"content\": [{\"type\": \"text\", \"text\": \"%USER_MESSAGE%\"}]}], \"temperature\": 1, \"max_tokens\": 256, \"top_p\": 1, \"frequency_penalty\": 0, \"presence_penalty\": 0}"


:: Use curl to send the request
curl https://api.openai.com/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer REPLACE_ME_WITH_YOUR_OPENAI_API_KEY" ^
  -d "!JSON_PAYLOAD!"

endlocal