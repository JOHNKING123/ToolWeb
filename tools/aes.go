package tools

import (
	"crypto/aes"
	"encoding/base64"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleAESTool 处理AES工具页面
func HandleAESTool(c *gin.Context) {
	c.HTML(http.StatusOK, "aes", gin.H{
		"Title": "AES 加解密",
	})
}

// HandleAESAPI 处理AES加解密API
func HandleAESAPI(c *gin.Context) {
	type Req struct {
		Input string `json:"input" form:"input"`
		Key   string `json:"key" form:"key"`
		Mode  string `json:"mode" form:"mode"` // encrypt/decrypt
	}
	var req Req
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	if len(req.Key) != 16 && len(req.Key) != 24 && len(req.Key) != 32 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "密钥长度必须为16/24/32字节"})
		return
	}
	if req.Mode == "encrypt" {
		ciphertext, err := aesEncrypt([]byte(req.Input), []byte(req.Key))
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "msg": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "result": base64.StdEncoding.EncodeToString(ciphertext)})
	} else if req.Mode == "decrypt" {
		data, err := base64.StdEncoding.DecodeString(req.Input)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "msg": "输入内容不是有效的Base64"})
			return
		}
		plaintext, err := aesDecrypt(data, []byte(req.Key))
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "msg": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "result": string(plaintext)})
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "mode参数必须为encrypt或decrypt"})
	}
}

// AES加密（ECB模式，PKCS7填充）
func aesEncrypt(plaintext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	bs := block.BlockSize()
	plaintext = pkcs7Pad(plaintext, bs)
	ciphertext := make([]byte, len(plaintext))
	for start := 0; start < len(plaintext); start += bs {
		block.Encrypt(ciphertext[start:start+bs], plaintext[start:start+bs])
	}
	return ciphertext, nil
}

// AES解密（ECB模式，PKCS7填充）
func aesDecrypt(ciphertext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	bs := block.BlockSize()
	if len(ciphertext)%bs != 0 {
		return nil, err
	}
	plaintext := make([]byte, len(ciphertext))
	for start := 0; start < len(ciphertext); start += bs {
		block.Decrypt(plaintext[start:start+bs], ciphertext[start:start+bs])
	}
	return pkcs7Unpad(plaintext, bs)
}

// PKCS7填充
func pkcs7Pad(data []byte, blockSize int) []byte {
	padLen := blockSize - len(data)%blockSize
	pad := make([]byte, padLen)
	for i := range pad {
		pad[i] = byte(padLen)
	}
	return append(data, pad...)
}

// PKCS7去填充
func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	if len(data) == 0 || len(data)%blockSize != 0 {
		return nil, http.ErrBodyNotAllowed
	}
	padLen := int(data[len(data)-1])
	if padLen == 0 || padLen > blockSize {
		return nil, http.ErrBodyNotAllowed
	}
	for _, v := range data[len(data)-padLen:] {
		if int(v) != padLen {
			return nil, http.ErrBodyNotAllowed
		}
	}
	return data[:len(data)-padLen], nil
}
