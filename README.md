# Aoo 棋牌游戏前端目录规范

业务和资源分类目录统一使用首字母大写：Common、Login、Lobby、Club、Games，以及 Code、Prefab、Atlas、Audio、Spine、Font、Config。

稳定技术标识继续小写：gameId、Bundle ID、协议字段、地区玩法编码和下载路径。iOS、Android、Linux 构建机与 CDN 必须共用完全一致的路径大小写，不采用运行时临时转换。

注意：此前整理时认证目录文件丢失且没有找到本地副本，必须从原始来源补回后才能认定登录框架完整。
