// @ts-nocheck
// Generated from the Creator 2.2.2 AHHBMJ room model; method bodies and protocol semantics are preserved.
export type LegacyAhhbmjAppContext = Record<string, any>;
export class LegacyAhhbmjRoomPositionManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAhhbmjAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app["subGameName"] + "RoomPosMgr";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.WeChatManager = this.app[this.app.subGameName+"_WeChatManager"]();

        // S2228_LostConnect
        this.OnReload();

		console.log("Init");


  }

  public OnReload() {
		//{
		//	1:{
		//		"pos":pos,
		//		"pid":pid,//pid=0未有玩家坐下
		//		"name":name,
		//		"roomReady":false,
		//		"gameReady":false,
		//		"giveUpGame":0,
		//		"point":100,
		//		"flashCnt":10,
		//		"paiPin":100,
		//		"up":10,
		//		"down":10
		// 		"isLostConnect":false
		// },
		//}
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
  }


	//-----------------------回调函数-----------------------------
  public OnInitRoomPosData(roomPosInfoList) {
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;

		let heroImageUrlDict = {};
		let heroID = this.app[this.app.subGameName + "_HeroManager"]().GetHeroID();
		let count = roomPosInfoList.length;

		for(let index=0; index<count; index++){
			let roomPosInfo = roomPosInfoList[index];
			let pos = roomPosInfo["pos"];
			this.dataInfo[pos] = roomPosInfo;


			let pid = roomPosInfo["pid"];
			let headImageUrl = roomPosInfo["headImageUrl"];
			if(pid == heroID){
				this.clientPos = pos;
			}
			if(pid && headImageUrl){
				heroImageUrlDict[pid] = headImageUrl;
			}
			this.WeChatManager.InitHeroHeadImage(pid, headImageUrl);
		}

		//this.WeChatManager.InitHeroHeadImageByDict(heroImageUrlDict);
		if(this.clientPos < 0){
			console.error("OnInitRoomPosData clientPos not find");
		}
		else{
			let posCount = 4;
			if(count == 2){
				this.facePos = this.clientPos == 0 ? 1 : 0;
			}else if(count==3){
				this.upPos = (this.clientPos + count - 1)%count;
				this.downPos = (this.clientPos + 1)%count;


				// this.upPos = (this.clientPos + posCount - 1)%posCount;
				// this.downPos = (this.clientPos + 1)%posCount;
				// this.facePos = (this.clientPos + 2)%posCount;
				// //三人麻将，有一家是空的
				// if(this.clientPos==0){
				// 	this.upPos=-1;
				// }
				// if(this.clientPos==1){
				// 	this.facePos=-1;
				// }
				// if(this.clientPos==2){
				// 	this.downPos=-1;
				// }
			}else{
				this.upPos = (this.clientPos + posCount - 1)%posCount;
				this.downPos = (this.clientPos + 1)%posCount;
				this.facePos = (this.clientPos + 2)%posCount;
			}
			console.log("upPos(%s) clientPos(%s) downPos(%s) facePos(%s)", this.upPos, this.clientPos, this.downPos, this.facePos);
		}

		console.log("OnInitRoomPosData:", this.dataInfo)
  }

  public OnPosLeave(pos) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			console.error("OnPosLeave not find:%s", pos);
			return
		}
		playerInfo["isLostConnect"] = 0;
		playerInfo["pid"] = 0;
		playerInfo["name"] = 0;
		playerInfo["roomReady"] = false;
		playerInfo["gameReady"] = false;
		playerInfo["isPosReady"] = false;
		playerInfo["giveUpGame"] = 0;
		playerInfo["point"] = 0;
		playerInfo["realPoint"] = 0;
		playerInfo["flashCnt"] = 0;
		playerInfo["paiPin"] = 0;
		playerInfo["up"] = 0;
		playerInfo["down"] = 0;
  }
  public GetPosReady(pos) {
    	return this.dataInfo[pos]["isPosReady"];
  }
  public OnPosOpCard(serverPack) {
        let isFlash = serverPack["isFlash"];
        let pos = serverPack["pos"];
        /*let falshCnt = this.dataInfo[pos]["flashCnt"];
        if (isFlash) {
            falshCnt++;
            this.dataInfo[pos]["flashCnt"] = falshCnt;
        }*/
  }
  public UpdatePoint(posData) {
		for (let i = 0; i < posData.length; i++) {
			let data = posData[i];
			this.dataInfo[data.posID]["point"] = data.point;
			this.dataInfo[data.posID]["realPoint"] = data.point;
			this.dataInfo[data.posID]["clubCent"] = data.clubCent;
		}
  }
	//座位信息更新
  public OnPosUpdate(pos, posInfo) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			console.log("OnPosUpdate not find:%s", pos);
			return false
		}
		this.dataInfo[pos] = posInfo;
		let heroID = posInfo["pid"];
		let headImageUrl = posInfo["headImageUrl"];
		if(heroID && headImageUrl){
			this.WeChatManager.InitHeroHeadImage(heroID, headImageUrl);
		}

		return true
  }
  public SetPosReady(pos,isPosReady) {
    	this.dataInfo[pos]["isPosReady"] = isPosReady;
    	return true
  }
	//开局准备
  public OnPosReadyChg(pos, roomReady) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			console.log("OnPosReadyChg not find:%s", pos);
			return false
		}
		playerInfo["roomReady"] = roomReady;

		return true
  }

	//准备下一句
  public OnPosContinueGame(pos) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			console.error("OnPosContinueGame not find:%s", pos);
			return
		}
		playerInfo["gameReady"] = true;
  }

  public OnSetEnd(setEnd) {
		let posResultList = setEnd["posResultList"];
		//清除准备状态
		for(let pos in this.dataInfo){
			let playerInfo = this.dataInfo[pos];
			playerInfo["point"] += posResultList[pos]["point"];
			
			playerInfo["gameReady"] = false;
		    this.dataInfo[pos]['point']=playerInfo["point"];
		    //俱乐部积分
	        if (typeof(playerInfo.clubCent)!="undefined") {
	            let sp = parseFloat(playerInfo["clubCent"]).toFixed(2);
	            let addSp = parseFloat(setEnd.posResultList[pos].clubCent).toFixed(2);
	            let totalSp = parseFloat(sp) + parseFloat(addSp);
	            //保留小数点后面两位
				playerInfo["clubCent"] = totalSp.toFixed(2);
	            this.dataInfo[pos]['clubCent'] = totalSp.toFixed(2);

	            let real = parseFloat(playerInfo["realPoint"]).toFixed(2);
                let addReal = parseFloat(setEnd.posResultList[pos].clubCent).toFixed(2);
                let totalReal = parseFloat(real) + parseFloat(addReal);
                playerInfo["realPoint"] = totalReal.toFixed(2);
	        }
		}

  }
  public OnClubCentChange(serverPack) {
		//同步更新俱乐部积分
		for(let pos in this.dataInfo){
			let playerInfo = this.dataInfo[pos];
			if (pos == serverPack.posId &&
				playerInfo.pid == serverPack.pid) {
	            let sp = parseFloat(playerInfo["clubCent"]).toFixed(2);
	            let addSp = parseFloat(serverPack.clubCent).toFixed(2);
	            let totalSp = parseFloat(sp) + parseFloat(addSp);
	            //保留小数点后面两位
				playerInfo["clubCent"] = totalSp.toFixed(2);
	            this.dataInfo[pos]['clubCent'] = totalSp.toFixed(2);
			}
		}
  }

	//-------------------------获取接口---------------------
	//获取客户端玩家准备状态
  public GetPlayerReadyState(roomSetID) {
        let ReadyState = "";
        if(roomSetID > 0){
            ReadyState = "gameReady";
        }
        else {
            ReadyState = "roomReady";
        }
		return this.GetPlayerInfoByPos(this.clientPos)[ReadyState];
  }

	//设置玩家离线状态
  public SetPlayerOfflineState(pos, isLostConnect, isShowLeave) {
		if(!this.dataInfo.hasOwnProperty(pos)){
			console.error("SetPlayerOfflineState not find:%s", pos);
			return
		}
		this.dataInfo[pos]["isLostConnect"] = isLostConnect;
		this.dataInfo[pos]["isShowLeave"] = isShowLeave;
  }

	//获取房间所有玩家信息
  public GetRoomAllPlayerInfo() {
		return this.dataInfo
  }
	 //获取房间有几个玩家
  public GetRoomPlayerCount() {
        let count=0;
		if(this.clientPos>-1){
		    count++;
		}
		if(this.downPos>-1){
		    count++;
		}
		if(this.upPos>-1){
		    count++;
		}
		if(this.facePos>-1){
		    count++;
		}
		return count;
  }
	//获取房间指定位置玩家信息
  public GetPlayerInfoByPos(pos) {
		if(!this.dataInfo.hasOwnProperty(pos)){
			console.error("GetPlayerInfoByPos(%s) not find", pos);
			return
		}
		return this.dataInfo[pos];
  }

	//获取客户端玩家的座位
  public GetClientPos() {
		return this.clientPos
  }

	//获取客户端玩家的上家位置ID
  public GetClientUpPos() {
		return this.upPos
  }

	//获取客户端玩家下家位置ID
  public GetClientDownPos() {
		return this.downPos
  }

	//获取客户端玩家对家位置ID
  public GetClientFacePos() {
		return this.facePos
  }

  public GetUIPosByDataPos(dataPos) {
		let player = this.GetPlayerInfoByPos(dataPos);
        if(!player || !player["pid"]){
        	return -1;
        }
		let clientPos = this.GetClientPos();
        let downPos = this.GetClientDownPos();
        let facePos = this.GetClientFacePos();
        let upPos = this.GetClientUpPos();
        if(player["pos"] == clientPos)
        	return 1;
        else if(player["pos"] == downPos)
        	return 2;
        else if(player["pos"] == facePos)
            return 3;
        else if(player["pos"] == upPos)
            return 4;
        else
        	return -1;
	}

}
