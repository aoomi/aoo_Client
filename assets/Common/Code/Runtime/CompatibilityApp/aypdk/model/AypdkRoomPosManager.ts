// @ts-nocheck
// Generated from Creator 2.2.2 by tools/migrate-aypdk-models.mjs.
// Legacy method bodies are preserved; only the BaseClass container is replaced.
export type AypdkAppContext = Record<string, any>;

export class AypdkRoomPosManager {
    public constructor(private readonly app: AypdkAppContext) {
        this.Log = this.Log ?? (() => undefined);
        this.ErrLog = this.ErrLog ?? (() => undefined);
        this.Init();
    }



	/**
	 * 初始化
	 */
	public Init(){

		this.JS_Name = this.app.subGameName.toUpperCase()+"RoomPosMgr";

		this.ComTool = this.app[this.app.subGameName+"_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName+"_ShareDefine"]();
		this.WeChatManager = this.app[this.app.subGameName+"_WeChatManager"]();

        // S2228_LostConnect
        this.OnReload();

		this.Log("Init");


	}
	public OnReload(){
		
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
		this.posCount = -1;
	}
	//-----------------------回调函数-----------------------------
	public OnInitRoomPosData(roomPosInfoList){
		this.dataInfo = {};

		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
		this.posCount = -1;
		let heroImageUrlDict = {};
		let heroID = this.app[this.app.subGameName+"_HeroManager"]().GetHeroID();
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
		// if(this.clientPos < 0){
		// 	this.ErrLog("OnInitRoomPosData clientPos not find");
		// }
		// else{
		// 	let posNum = 4;
		// 	if(this.posCount != 2){
		// 		this.upPos = (this.clientPos + posNum - 1)%posNum;
		// 		this.downPos = (this.clientPos + 1)%posNum;
		// 		this.facePos = (this.clientPos + 2)%posNum;

		// 	}
		// 	else
		// 		this.facePos = this.clientPos == 0 ? 1 : 0;
			
		// 	this.Log("upPos(%s) clientPos(%s) downPos(%s) facePos(%s)", this.upPos, this.clientPos, this.downPos, this.facePos);
		// }

		this.upPos = (this.clientPos + this.posCount - 1)%this.posCount;
		this.downPos = (this.clientPos + 1)%this.posCount;
		this.facePos = (this.clientPos + 2)%this.posCount;

		this.Log("OnInitRoomPosData:", this.dataInfo)
	}
	//获取房间有几个玩家
    public GetRoomPlayerCount(){
        return this.posCount;
    }
    public UpdateOwnerID(ownerID){
		this.dataInfo['ownerID']=ownerID;
	}
	public OnPosLeave(pos){
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
		playerInfo["flashCnt"] = 0;
		playerInfo["paiPin"] = 0;
		playerInfo["up"] = 0;
		playerInfo["down"] = 0;
	}
	//座位信息更新
	public OnPosUpdate(pos, posInfo){
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
	public OnPosIsReady(pos, isReady){
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.Log("onPosTotalJifen not find:%s", pos);
			return false
		}
		playerInfo.isCardReady = isReady;
		
	}
	//开局准备
	public OnPosReadyChg(pos, roomReady){
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.Log("OnPosReadyChg not find:%s", pos);
			return false
		}
		playerInfo["roomReady"] = roomReady;

		return true
	}
	//准备下一句
	public OnPosContinueGame(pos){
		let playerInfo = this.dataInfo[pos];
		if(!playerInfo){
			this.ErrLog("OnPosContinueGame not find:%s", pos);
			return
		}
		playerInfo["gameReady"] = true;
	}
	public OnSetEnd(setEnd){
		//清除准备状态
		for(let pos in this.dataInfo){
			let playerInfo = this.dataInfo[pos];
			playerInfo["gameReady"] = false;
			playerInfo["point"] = setEnd.totalPointList[pos];
			this.dataInfo[pos]['point'] = playerInfo["point"];
			//俱乐部积分
	        if (typeof(playerInfo.clubCent)!="undefined") {
	            let sp = parseFloat(playerInfo["clubCent"]).toFixed(2);
	            let addSp = parseFloat(setEnd.clubCentList[pos]).toFixed(2);
	            let totalSp = parseFloat(sp) + parseFloat(addSp);
	            //保留小数点后面两位
				playerInfo["clubCent"] = totalSp.toFixed(2);
	            this.dataInfo[pos]['clubCent'] = totalSp.toFixed(2);
	        }
		}

		// this.OnPoint(setEnd.pointList);
	}
	//更新积分，如果是断线重连不需要增加分数，直接同步服务端的分数就好
	// OnPoint:function(pointList, isReconnect = false){
	// 	for(let pos in this.dataInfo){
	// 		let playerInfo = this.dataInfo[pos];
	// 		if(isReconnect){
	// 			playerInfo["point"] = pointList[pos].point;
	// 		}
	// 		else{
	// 			playerInfo["point"] += pointList[pos];
	// 		}
	// 	}
	// },
	public OnClubCentChange(serverPack){
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
	public GetPlayerReadyState(roomSetID){
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
	public SetPlayerOfflineState(pos, isLostConnect, isShowLeave){
		if(!this.dataInfo.hasOwnProperty(pos)){
			this.ErrLog("SetPlayerOfflineState not find:%s", pos);
			return
		}
		this.dataInfo[pos]["isLostConnect"] = isLostConnect;
		this.dataInfo[pos]["isShowLeave"] = isShowLeave;
    }
	//获取房间所有玩家信息
	public GetRoomAllPlayerInfo(){
		return this.dataInfo
	}
	public GetPlayerInfoByPid(pid){
		for(let i in this.dataInfo){
			if(pid == this.dataInfo[i].pid)
				return this.dataInfo[i];
		}
        return null;
    }
	//获取房间指定位置玩家信息
	public GetPlayerInfoByPos(pos){
		if(!this.dataInfo.hasOwnProperty(pos)){
			this.ErrLog("GetPlayerInfoByPos(%s) not find", pos);
			return
		}
		return this.dataInfo[pos];
	}
	//获取客户端玩家的座位
	public GetClientPos(){
		return this.clientPos
	}
	//获取客户端玩家的上家位置ID
	public GetClientUpPos(){
		return this.upPos
	}
	//获取客户端玩家下家位置ID
	public GetClientDownPos(){
		return this.downPos
	}
	//获取客户端玩家对家位置ID
	public GetClientFacePos(){
		return this.facePos
	}
	//获取开设房间位置的数量
	public GetPosCount(){
		return this.posCount;
	}
	//服务端位置转客户端位置
	public GetUIPosByDataPos(dataPos){
		let playerCount = this.posCount;
		let uiPos = (dataPos + (playerCount - this.clientPos)) % playerCount;
		//如果是两人场，是对面做，用0和2位置
		//如果是三人场，是使用0,1,3位置
		// if (playerCount == 2 && uiPos == 1) {
		// 	uiPos = 2;
		// }else if (playerCount == 3 && uiPos == 2) {
		// 	uiPos = 3;
		// }
	
		return uiPos;
	}
}
