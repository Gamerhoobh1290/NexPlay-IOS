@ECHO OFF
SETLOCAL

SET DIRNAME=%~dp0
IF "%DIRNAME%"=="" SET DIRNAME=.
SET APP_HOME=%DIRNAME%
SET WRAPPER_JAR=%APP_HOME%gradle\wrapper\gradle-wrapper.jar

IF NOT EXIST "%WRAPPER_JAR%" (
  ECHO ERROR: Missing Gradle wrapper jar at "%WRAPPER_JAR%"
  EXIT /B 1
)

IF DEFINED JAVA_HOME (
  SET JAVA_EXE=%JAVA_HOME%\bin\java.exe
  IF NOT EXIST "%JAVA_EXE%" (
    ECHO ERROR: JAVA_HOME is set but java.exe was not found at "%JAVA_EXE%"
    EXIT /B 1
  )
  "%JAVA_EXE%" -Xms64m -Xmx64m -classpath "%WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
) ELSE (
  java.exe -Xms64m -Xmx64m -classpath "%WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
)

ENDLOCAL
