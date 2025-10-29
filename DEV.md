## 构建、启动、进入容器
```sh
docker-compose build janus 
docker-compose up -d 
docker exec -it janus-gateway-janus-1 bash
```

## 进入容器后，按README.md的步骤安装
```sh
sh autogen.sh
./configure --prefix=/opt/janus
make
sudo make install
sudo make configs
```

## 启动janus
```sh
/opt/janus/bin/janus
```

## 启动前端（在容器外启动）
```sh
cd html
python -m http.server 8888
```

## 测试
```
浏览器访问：http://localhost:8888/demos/echotest.html
点击start
```