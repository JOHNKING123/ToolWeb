package tools

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleRSATool 处理RSA工具页面
func HandleRSATool(c *gin.Context) {
	c.HTML(http.StatusOK, "rsa", gin.H{
		"Title": "RSA 加解密",
	})
}

// HandleRSAAPI 处理RSA加解密API
func HandleRSAAPI(c *gin.Context) {
	type Req struct {
		Input     string `json:"input" form:"input"`
		Key       string `json:"key" form:"key"`
		KeyType   string `json:"keyType" form:"keyType"` // public/private
		Mode      string `json:"mode" form:"mode"`       // encrypt/decrypt/sign/verify
		SignInput string `json:"signInput" form:"signInput"`
		Signature string `json:"signature" form:"signature"`
	}
	var req Req
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	var result string
	var err error
	switch req.Mode {
	case "encrypt":
		if req.KeyType != "public" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "加密需使用公钥"})
			return
		}
		result, err = rsaEncrypt(req.Input, req.Key)
	case "decrypt":
		if req.KeyType != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "解密需使用私钥"})
			return
		}
		result, err = rsaDecrypt(req.Input, req.Key)
	case "sign":
		if req.KeyType != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "签名需使用私钥"})
			return
		}
		result, err = rsaSign(req.SignInput, req.Key)
	case "verify":
		if req.KeyType != "public" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "验签需使用公钥"})
			return
		}
		ok, err := rsaVerify(req.SignInput, req.Signature, req.Key)
		if err == nil && ok {
			c.JSON(http.StatusOK, gin.H{"success": true, "result": "验签通过"})
			return
		} else if err == nil && !ok {
			c.JSON(http.StatusOK, gin.H{"success": false, "result": "验签失败"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "mode参数错误"})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "result": result})
}

// RSA加密（公钥）
func rsaEncrypt(plainText, pubKey string) (string, error) {
	block, _ := pem.Decode([]byte(pubKey))
	if block == nil {
		return "", errors.New("公钥格式错误")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return "", err
	}
	cipherText, err := rsa.EncryptPKCS1v15(rand.Reader, pub.(*rsa.PublicKey), []byte(plainText))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(cipherText), nil
}

// RSA解密（私钥）
func rsaDecrypt(cipherTextB64, privKey string) (string, error) {
	block, _ := pem.Decode([]byte(privKey))
	if block == nil {
		return "", errors.New("私钥格式错误")
	}
	var priv *rsa.PrivateKey
	var err error
	priv, err = x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// 尝试PKCS8
		var key interface{}
		key, err = x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return "", errors.New("私钥格式错误: " + err.Error())
		}
		var ok bool
		priv, ok = key.(*rsa.PrivateKey)
		if !ok {
			return "", errors.New("不是RSA私钥")
		}
	}
	cipherText, err := base64.StdEncoding.DecodeString(cipherTextB64)
	if err != nil {
		return "", err
	}
	plainText, err := rsa.DecryptPKCS1v15(rand.Reader, priv, cipherText)
	if err != nil {
		return "", err
	}
	return string(plainText), nil
}

// RSA签名（私钥，SHA256）
func rsaSign(data, privKey string) (string, error) {
	block, _ := pem.Decode([]byte(privKey))
	if block == nil {
		return "", errors.New("私钥格式错误")
	}
	var priv *rsa.PrivateKey
	var err error
	priv, err = x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// 尝试PKCS8
		var key interface{}
		key, err = x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return "", errors.New("私钥格式错误: " + err.Error())
		}
		var ok bool
		priv, ok = key.(*rsa.PrivateKey)
		if !ok {
			return "", errors.New("不是RSA私钥")
		}
	}
	hash := sha256.Sum256([]byte(data))
	signature, err := rsa.SignPKCS1v15(rand.Reader, priv, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

// RSA验签（公钥，SHA256）
func rsaVerify(data, signatureB64, pubKey string) (bool, error) {
	block, _ := pem.Decode([]byte(pubKey))
	if block == nil {
		return false, errors.New("公钥格式错误")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false, err
	}
	signature, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return false, err
	}
	hash := sha256.Sum256([]byte(data))
	err = rsa.VerifyPKCS1v15(pub.(*rsa.PublicKey), crypto.SHA256, hash[:], signature)
	if err != nil {
		return false, nil
	}
	return true, nil
}
