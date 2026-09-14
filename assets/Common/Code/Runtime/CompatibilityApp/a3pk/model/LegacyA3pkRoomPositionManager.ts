// @ts-nocheck
// Generated from the Creator 2.2.2 A3PK model. Method bodies and protocol semantics are preserved.
export type LegacyA3pkAppContext = Record<string, any>;

export class LegacyA3pkRoomPositionManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyA3pkAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "A3PKRoomPosMgr";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.WeChatManager = this.app[this.app.subGameName + "_WeChatManager"]();
		this.A3PKRoomSet = this.app.A3PKRoomSet();

        // S2228_LostConnect
        this.OnReload();

		this.Log("Init");


  }

  public OnReload() {
		
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
		this.posCount = -1;
  }
  public OnInitRoomPosReWard(posInfo) {
		for(let i=0;i<posInfo.length;i++){
			this.dataInfo[i].rewardScore=posInfo[i].rewardScore;
		}
  }

	//-----------------------回调函数-----------------------------
  public OnInitRoomPosData(roomPosInfoList) {
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
		this.posCount = -1;
		let heroImageUrlDict = {};
		let heroID = this.app[this.app.subGameName + "_HeroManager"]().GetHeroID();
		this.posCount = roomPosInfoList.length;

		for(let index=0; index<this.posCount; index++){
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
		}

		this.WeChatManager.InitHeroHeadImageByDict(heroImageUrlDict);

		this.upPos = (this.clientPos + this.posCount - 1)%this.posCount;
		this.downPos = (this.clientPos + 1)%this.posCount;
		this.facePos = (this.clientPos + 2)%this.posCount;

		this.Log("OnInitRoomPosData:", this.dataInfo)
  }
	//获取房间有几个玩家
  public GetRoomPlayerCount() {
        return this.posCount;
  }
  public UpdateOwnerID(ownerID) {
		this.dataInfo['ownerID']=ownerID;
  }

  public OnPosLeave(pos) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.ErrLog("OnPosLeave not find:%s", pos);
			return
		}
		playerInfo["pid"] = 0;
		playerInfo["name"] = 0;
		playerInfo["roomReady"] = false;
		playerInfo["gameReady"] = false;
		playerInfo["giveUpGame"] = 0;
		playerInfo["point"] = 0;
		playerInfo["rewardScore"] = 0;
		playerInfo["flashCnt"] = 0;
		playerInfo["paiPin"] = 0;
		playerInfo["up"] = 0;
		playerInfo["down"] = 0;
  }
  public SetPosReady(pos,isPosReady) {
    	this.dataInfo[pos]["isPosReady"] = isPosReady;
  }
  public GetPosReady(pos) {
    	if(this.dataInfo[pos]){
    		if(this.dataInfo[pos]["isPosReady"]){
    			return this.dataInfo[pos]["isPosReady"];
    		}
    	}
    	return false;
    	
  }

	//座位信息更新
  public OnPosUpdate(pos, posInfo) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.Log("OnPosUpdate not find:%s", pos);
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

  public OnPosIsReady(pos, isReady) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.Log("onPosTotalJifen not find:%s", pos);
			return false
		}
		playerInfo.isCardReady = isReady;
		
  }

	//开局准备
  public OnPosReadyChg(pos, roomReady) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.Log("OnPosReadyChg not find:%s", pos);
			return false
		}
		playerInfo["roomReady"] = roomReady;

		return true
  }

	//准备下一句
  public OnPosContinueGame(pos) {
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.ErrLog("OnPosContinueGame not find:%s", pos);
			return
		}
		playerInfo["gameReady"] = true;
  }

  public OnSetEnd(setEnd) {
		let posResultList = setEnd["posResultList"];
		//清除准备状态
		for (let pos in this.dataInfo) {
			let playerInfo = this.dataInfo[pos];
			playerInfo["point"] = posResultList[pos]["roomPoint"];
			playerInfo["gameReady"] = false;
			this.dataInfo[pos]['point'] = playerInfo["point"];
			//俱乐部积分
	        if (typeof(playerInfo.clubCent)!="undefined") {
	            let sp = parseFloat(playerInfo["clubCent"]).toFixed(2);
	            let addSp = parseFloat(setEnd.posResultList[pos].clubCent).toFixed(2);
	            let totalSp = parseFloat(sp) + parseFloat(addSp);
	            //保留小数点后面两位
				playerInfo["clubCent"] = totalSp.toFixed(2);
	            this.dataInfo[pos]['clubCent'] = totalSp.toFixed(2);
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
  public UpdateRewardScore(pos,rewardScore) {
		this.dataInfo[pos]['rewardScore'] = rewardScore;
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
  public SetPlayerOfflineState(pos, isLostConnect) {
		if(!this.dataInfo.hasOwnProperty(pos)){
			this.ErrLog("SetPlayerOfflineState not find:%s", pos);
			return
		}
		this.dataInfo[pos]["isLostConnect"] = isLostConnect;
  }

	//获取房间所有玩家信息
  public GetRoomAllPlayerInfo() {
		return this.dataInfo;
  }

  public GetPlayerInfoByPid(pid) {
		for(let i in this.dataInfo){
			if(pid == this.dataInfo[i].pid)
				return this.dataInfo[i];
		}
        return null;
  }

	//获取房间指定位置玩家信息
  public GetPlayerInfoByPos(pos) {
		if(!this.dataInfo.hasOwnProperty(pos)){
			this.ErrLog("GetPlayerInfoByPos(%s) not find", pos);
			return
		}
		return this.dataInfo[pos];
  }

	//设置房间指定位置玩家指定字段信息
  public SetPlayerInfoByPos(pos, propertyName, propertyValue) {
		if(!this.dataInfo.hasOwnProperty(pos)){
			this.ErrLog("SetPlayerInfoByPos(%s) not find", pos);
			return;
		}
		this.dataInfo[pos][propertyName] = propertyValue;
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

	//获取开设房间位置的数量
  public GetPosCount() {
		return this.posCount;
  }

	//服务端位置转客户端位置
  public GetUIPosByDataPos(dataPos) {
		let playerCount = this.posCount;
		let uiPos = (dataPos + (playerCount - this.clientPos)) % playerCount;
		return uiPos;
	}
}
