#!/bin/bash
rm toolWeb.bak
git  pull
mv toolWeb toolWeb.bak
go build -o toolWeb
