package logger

import (
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

const (
	logTmFmtWithMS = "2006-01-02 15:04:05.000"
)

func InitLogger() *zap.Logger {
	writeSyncer := getLogWriter()
	encoder := getEncoder()
	core := zapcore.NewCore(encoder, writeSyncer, zapcore.DebugLevel)
	return zap.New(core, zap.AddCaller())
}

// 自定义时间输出格式
func customTimeEncoder(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + t.Format(logTmFmtWithMS) + "]")
}

// 自定义日志级别显示
func customLevelEncoder(level zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + level.CapitalString() + "]")
}

// 自定义文件：行号输出项
func customCallerEncoder(caller zapcore.EntryCaller, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + caller.TrimmedPath() + "]")
}

func getEncoder() zapcore.Encoder {
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = customTimeEncoder     // 自定义时间格式
	encoderConfig.EncodeLevel = customLevelEncoder   // 小写编码器
	encoderConfig.EncodeCaller = customCallerEncoder // 全路径编码器
	return zapcore.NewConsoleEncoder(encoderConfig)
}

func getLogWriter() zapcore.WriteSyncer {
	dir, _ := os.UserConfigDir()
	logDir := filepath.Join(dir, "jumpserver-client")
	// 确保日志目录存在
	if err := os.MkdirAll(logDir, 0755); err != nil {
		// 如果创建目录失败，使用标准输出
		return zapcore.AddSync(os.Stdout)
	}
	filePath := filepath.Join(logDir, "client.log")
	file, err := os.Create(filePath)
	if err != nil {
		// 如果创建文件失败，使用标准输出
		return zapcore.AddSync(os.Stdout)
	}
	return zapcore.AddSync(file)
}
