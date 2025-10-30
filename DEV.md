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
nohup /opt/janus/bin/janus &
```

## 启动前端（在容器外启动）
```sh
cd html
nohup python3 -m http.server 8888 &
```

## 测试
```
浏览器访问：http://localhost:8888/demos/echotest.html
点击start
```

## 外网部署相关
1. conf/janus.jcfg.sample.in，nat_1_1_mapping修改为公网ip。
2. conf/janus.jcfg.sample.in，rtp_port_range修改为60000-61000。（注意需要放开防火墙的相关端口，运行udp可以协议）
3. 按docker/janus.nginx.conf配置nginx。