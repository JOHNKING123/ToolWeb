package tools

import (
	"crypto/des"
	"encoding/base64"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleDESTool 处理DES工具页面
func HandleDESTool(c *gin.Context) {
	c.HTML(http.StatusOK, "des", gin.H{
		"Title": "DES 加解密",
	})
}

// HandleDESAPI 处理DES加解密API
func HandleDESAPI(c *gin.Context) {
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
	if len(req.Key) != 8 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "密钥长度必须为8字节"})
		return
	}
	if req.Mode == "encrypt" {
		ciphertext, err := desEncrypt([]byte(req.Input), []byte(req.Key))
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
		plaintext, err := desDecrypt(data, []byte(req.Key))
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "msg": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "result": string(plaintext)})
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "mode参数必须为encrypt或decrypt"})
	}
}

// DES加密（ECB模式，PKCS7填充）
func desEncrypt(plaintext, key []byte) ([]byte, error) {
	block, err := des.NewCipher(key)
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

// DES解密（ECB模式，PKCS7填充）
func desDecrypt(ciphertext, key []byte) ([]byte, error) {
	block, err := des.NewCipher(key)
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
