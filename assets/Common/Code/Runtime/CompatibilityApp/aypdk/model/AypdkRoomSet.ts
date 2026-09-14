// @ts-nocheck
// Generated from Creator 2.2.2 by tools/migrate-aypdk-models.mjs.
// Legacy method bodies are preserved; only the BaseClass container is replaced.
export type AypdkAppContext = Record<string, any>;

export class AypdkRoomSet {
    public constructor(private readonly app: AypdkAppContext) {
        this.Log = this.Log ?? (() => undefined);
        this.ErrLog = this.ErrLog ?? (() => undefined);
        this.Init();
    }



	/**
	 * 初始化
	 */
	public Init(){

		this.JS_Name = this.app.subGameName.toUpperCase()+"RoomSet";

		this.ComTool = this.app[this.app.subGameName+"_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName+"_ShareDefine"]();

		this.OnReload();
		this.Log("Init");

	}
	public OnReload(){
		this.dataInfo = {};
	}
	public InitSetInfo(setInfo){
		console.log('InitSetInfo', setInfo);

		this.dataInfo = setInfo;
	}
	//-----------------------回调函数-----------------------------
	public OnInitRoomSetData(setInfo){
		this.InitSetInfo(setInfo);
		let state = this.dataInfo["state"];

		if(this.ShareDefine.SetStateStringDict.hasOwnProperty(state)){
			this.dataInfo["state"] = this.ShareDefine.SetStateStringDict[state];
		}
		else{
			this.ErrLog("OnInitRoomSetData state:%s not find", state);
		}
		this.Log("OnInitRoomSetData:", this.dataInfo);
	}
	public OnSetStart(setInfo){
		this.InitSetInfo(setInfo);
		this.dataInfo["state"] = this.ShareDefine.SetState_Init;
	}
	public OnSetPlaying(opPos){
		this.dataInfo["opPos"] = opPos;
		this.dataInfo["state"] = this.ShareDefine.SetState_Playing;
	}
	public OnSetEnd(setEnd){
		this.dataInfo["setEnd"] = setEnd;
		this.dataInfo["state"] = this.ShareDefine.SetState_End;
		this.Log("OnSetEnd:", this.dataInfo);
	}
	//----------------获取接口--------------------

	//获取set属性值
	public GetRoomSetProperty(property){
		if(!this.dataInfo.hasOwnProperty(property)){
			this.ErrLog("GetSetProperty(%s) not find", property);
			return
		}
		return this.dataInfo[property];
	}
	public GetRoomSetInfo(){
		return this.dataInfo;
	}
	public GetHandCard(){
		let posInfo = this.dataInfo["posInfo"];
		for(let i = 0; i < posInfo.length; i++){
			if(posInfo[i].pid == this.app[this.app.subGameName+"_HeroManager"]().GetHeroProperty("pid")){
				return posInfo[i].cards;
			}
		}
	}
}
