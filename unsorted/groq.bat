@echo off
setlocal enabledelayedexpansion

:: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
:: !!!! MAKE SURE to paste your groq api key below !!!!
:: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

:: Check if an argument was provided
if "%~1"=="" (
    echo Please provide a message as an argument.
    exit /b 1
)

:: Set the message content
set "MESSAGE_CONTENT=%~1"


:: Prepare the JSON payload, escaping double quotes
set "JSON_PAYLOAD={\"messages\": [{\"role\": \"system\", \"content\": \"You are a helpful assistant. \"}, {\"role\": \"user\", \"content\": \"!MESSAGE_CONTENT!\"}], \"model\": \"llama3-70b-8192\", \"temperature\": 1, \"max_tokens\": 256, \"top_p\": 1, \"stream\": false, \"stop\": null}"

:: Execute the curl command
curl "https://api.groq.com/openai/v1/chat/completions" ^
  -X POST ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer REPLACE_ME_WITH_YOUR_GROQ_API_KEY" ^
  -d "!JSON_PAYLOAD!" 2>nul

endlocal