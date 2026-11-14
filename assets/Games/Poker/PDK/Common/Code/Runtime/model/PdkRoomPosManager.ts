// @ts-nocheck
// Generated from Creator 2.4.8 by tools/migrate-pdk-models.mjs.
// Legacy method bodies are preserved; only the BaseClass container is replaced.
import { requirePdkPlayerCount } from '../Room/PdkSeatPresenter';
export type PdkAppContext = Record<string, any>;

export class PdkRoomPosManager {
    public constructor(private readonly app: PdkAppContext) {
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
		const declaredPlayerCount = roomPosInfoList.find((entry) => entry?.playerCount || entry?.seatLimit)?.playerCount
			?? roomPosInfoList.find((entry) => entry?.seatLimit)?.seatLimit
			?? roomPosInfoList.length;
		this.posCount = requirePdkPlayerCount(Number(declaredPlayerCount));

		for(let index=0; index<roomPosInfoList.length; index++){
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

		if (this.clientPos >= 0) {
			this.upPos = (this.clientPos + this.posCount - 1)%this.posCount;
			this.downPos = (this.clientPos + 1)%this.posCount;
			this.facePos = (this.clientPos + 2)%this.posCount;
		}

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
	//获取客户端玩家下家位置ID
	//获取客户端玩家对家位置ID
	//获取开设房间位置的数量
	public GetPosCount(){
		return this.posCount;
	}
	public SetAuthoritativePlayerCount(playerCount){
		this.posCount = requirePdkPlayerCount(playerCount);
	}
	//服务端位置转客户端位置
}
