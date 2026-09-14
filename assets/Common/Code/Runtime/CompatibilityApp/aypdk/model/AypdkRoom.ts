// @ts-nocheck
// Generated from Creator 2.2.2 by tools/migrate-aypdk-models.mjs.
// Legacy method bodies are preserved; only the BaseClass container is replaced.
export type AypdkAppContext = Record<string, any>;

export class AypdkRoom {
    public constructor(private readonly app: AypdkAppContext) {
        this.Log = this.Log ?? (() => undefined);
        this.ErrLog = this.ErrLog ?? (() => undefined);
        this.Init();
    }



	/**
	 * 初始化
	 */
	public Init(){

		this.JS_Name = this.app.subGameName.toUpperCase()+"Room";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();

		this.RoomPosMgr = this.app[this.app.subGameName.toUpperCase() + "RoomPosMgr"]();
		this.RoomSet = this.app[this.app.subGameName.toUpperCase() + "RoomSet"]();
		this.SysDataManager = this.app[this.app.subGameName + "_SysDataManager"]();

		this.PropertyInfo = this.SysDataManager.GetTableDict("PropertyInfo");

		this.OnReload();

		this.Log("Init");

	}
	public OnReload(){

		this.dataInfo = {};

		this.roomConfig = {};

        this.roomRecord = {};

	}
	//-----------------------回调函数-----------------------------
	//登录初始化房间数据
	public OnInitRoomData(serverPack){

		serverPack["state"] = this.ShareDefine.RoomStateStringDict[serverPack["state"]];

		if(serverPack.prizeType == 'Gold'){
			this.app[this.app.subGameName+"_ShareDefine"]().isCoinRoom = true;
		}
		else if(serverPack.prizeType == 'RoomCard'){
			this.app[this.app.subGameName+"_ShareDefine"]().isCoinRoom = false;
		}

		let cfg = serverPack["cfg"];
		this.roomConfig = cfg;

		let roomPosInfoList = serverPack["posList"]||[];
		console.log('roomPosInfoList', roomPosInfoList);
		this.RoomPosMgr.OnInitRoomPosData(roomPosInfoList);

		let setInfo = serverPack["set"];
		this.RoomSet.OnInitRoomSetData(setInfo);

		//其余信息存放到dataInfo
		this.dataInfo = serverPack;

		this.isGetGR = false;
		this.Log("roomConfig:", this.roomConfig);
		this.Log("dataInfo:", this.dataInfo);
	}
	//位置离开
	public OnPosLeave(pos){
		this.RoomPosMgr.OnPosLeave(pos);
	}
	public UpdateOwnerID(ownerID){
		this.dataInfo['ownerID']=ownerID;
	}
	//继续游戏
	public OnPosContinueGame(pos){
		this.RoomPosMgr.OnPosContinueGame(pos);
	}
	//set开始
	public OnSetStart(setInfo){
		this.dataInfo["state"] = this.ShareDefine.RoomState_Playing;
		this.dataInfo["setID"] = setInfo["setID"];
		this.GetRoomSet().OnSetStart(setInfo);
	}
	//set结束
	public OnSetEnd(setEnd){
		this.RoomSet.OnSetEnd(setEnd);
		this.RoomPosMgr.OnSetEnd(setEnd);
	}
	//房间结束
	public OnRoomEnd(roomEnd){
		this.dataInfo["state"] = this.ShareDefine.RoomState_End;
		this.dataInfo["roomEnd"] = roomEnd;
	}
	//开始解散房间
	public OnStartVoteDissolve(createPos, endSec){
		let posAgreeList = [];

		for(let index=0; index<10; index++){
			console.log("createPos:"+createPos+",index:"+index);
			if(index == createPos){
				posAgreeList.push(1);
			}
			else{
				posAgreeList.push(0);
			}
		}
		let dissolveInfo = {"endSec":endSec,"createPos":createPos, "posAgreeList":posAgreeList};
		this.dataInfo["dissolve"] = dissolveInfo;
		return dissolveInfo;
	}
	//位置同意拒绝更新
	public OnPosDealVote(pos, agreeDissolve){

		let dissolveInfo = this.dataInfo["dissolve"];
		let posAgreeList = dissolveInfo["posAgreeList"];
		if(!posAgreeList){
			this.ErrLog("OnPosDealVote not find posAgreeList:", this.dataInfo);
			return
		}

		if(pos >= posAgreeList.length){
			this.ErrLog("OnPosDealVote(%s,%s):", pos, agreeDissolve, posAgreeList);
			return
		}

		if(agreeDissolve){
			posAgreeList[pos] = 1;
		}
		else{
			posAgreeList[pos] = 2;
		}
		return dissolveInfo
	}
	//更新房间内的对局记录信息
    public RoomRecord(serverPack){
		this.roomRecord = {};
		this.roomRecord = serverPack;
	}
	public OnClubCentChange(serverPack){
		this.RoomPosMgr.OnClubCentChange(serverPack);
	}
	//---------------------设置函数---------------------
	public OnDissolve(dissolve){
		this.dataInfo["dissolve"] = dissolve;
	}
	public GetRoomXianShi(){
		return this.roomConfig["xianShi"];
	}
	public OnPlaying(serverPack){
		//改变玩家出牌位置
		let opPos = serverPack.opPos;
		this.RoomSet.OnSetPlaying(opPos);
	}
	//---------------------获取函数---------------------
	//获取对局记录信息
	public GetRoomRecord(){
		return this.roomRecord;
	}
	//获取房间信息
	public GetRoomDataInfo(){
		return this.dataInfo;
    }
	//获取创建房间信息b
	public GetRoomProperty(property){
		if(!this.dataInfo.hasOwnProperty(property)){
			this.ErrLog("GetRoomProperty not find:%s", property);
			return
		}
		return this.dataInfo[property];
	}
	public ClearDissolve(){
		this.dataInfo['dissolve']='';
	}
	//获取房间配置信息
	public GetRoomConfig(){
		return this.roomConfig
	}
	//获取房间配置信息
	public GetRoomConfigByProperty(property){
		if(!this.roomConfig.hasOwnProperty(property)){
			this.ErrLog("GetRoomConfigByProperty not find:%s", property);
			return
		}
		console.log("property==="+property+"this.roomConfig[property]==="+this.roomConfig[property]);
		return this.roomConfig[property];
	}
	public GetRoomSet(){
		let setID = this.dataInfo["setID"];
		if(!setID){
			this.ErrLog("GetSet not start set");
			return
		}
		return this.RoomSet;
	}
	public GetRoomPosMgr(){
		return this.RoomPosMgr;
	}
	//客户端玩家是否是开房人
    public IsClientIsCreater(){
        let heroID = this.HeroManager.GetHeroID();
        if(heroID == this.dataInfo["ownerID"]){
            return true
        }
        return false
    }
	//客户端玩家是否是房主
	public IsClientIsOwner(){
		let heroID = this.HeroManager.GetHeroID();
		if(heroID == this.dataInfo["ownerID"]){
			return true
		}
		return false
	}
	public SetGameRecord(bget){
		this.isGetGR = bget;
	}
	public GetGameRecord(){
		return this.isGetGR;
	}
	//获取玩家setPos对象
	public GetClientPlayerSetPos(){

		let pos = this.RoomPosMgr.GetClientPos();
		if(pos < 0){
			this.ErrLog("GetClientPlayerSetPos not enter room");
			return
		}
		let setPos = this.RoomSet.GetSetPosByPos(pos);
		if(!setPos){
			this.ErrLog("GetClientPlayerSetPos(%s) not find setPos", pos);
			return
		}
		return setPos
	}
	//获取客户端玩家信息
    public GetClientPlayerInfo(){
		let pos = this.RoomPosMgr.GetClientPos();
		if(pos < 0){
			this.ErrLog("GetClientPlayerInfo not enter room");
			return
		}
		let playerInfo = this.RoomPosMgr.GetPlayerInfoByPos(pos);
		if(!playerInfo){
			this.ErrLog("GetClientPlayerInfo(%s) not find playerInfo", pos);
			return
		}
		return playerInfo
	}
	public GetRoomShouPai(){
		if(this.roomConfig["cardNum"]==0){
			return 15;
		}
		return 16;
	}
	public GetRoomWanfa(wanfa){
		if(this.roomConfig["kexuanwanfa"].indexOf(wanfa) != -1){
			return true;
		}
		return false;
	}
	public GetRoomPaiXing(wanfa){
		let paixing=[];
		paixing['SanBuDai']=0;
		paixing['SanDaiYi']=1;
		paixing['SanDaiYiDui']=2;
		paixing['SanDaiEr']=3;
		paixing['JieMeiDui']=4;
		paixing['SiDaiYi']=5;
		paixing['SanAZha']=6;
		paixing['SiDaiEr'] = 7;
		paixing['SiDaiSan'] = 8;
		paixing['QuanSanBuDai'] = 9;
		if(this.roomConfig["paixing"].indexOf(paixing[wanfa]) != -1){
			return true;
		}
		return false;
	}
	public GetRoomXianChuWanfa(wanfa){
		let chupai = this.roomConfig["chupai"];
		if(wanfa == chupai){
			return true;
		}
		return false;
	}
}
