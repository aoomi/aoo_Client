// @ts-nocheck
// Generated from the Creator 2.2.2 AHMJ room model; method bodies and protocol semantics are preserved.
export type LegacyAhmjAppContext = Record<string, any>;
export class LegacyAhmjSetPosition {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAhmjAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app["subGameName"] + "SetPos";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();

		this.OnReload();
		console.log("Init");

  }

  public OnReload() {
		this.dataInfo = {
							posID:0,
							handCard:0,
							buChuList:[],
							shouCard:[],
							outCard:[],
							publicCardList:[],
							huCard:[],
							niao:-1,
						};
  }

	//-----------------------回调函数-----------------------------
	//开局初始化
  public OnInitSetPos(setPosInfo) {
		this.dataInfo = setPosInfo;
		console.log("OnInitSetPos:", this.dataInfo);
  }

	//抓到一张牌
  public OnPosGetCard(setPosInfo) {
		this.dataInfo = setPosInfo;
		console.log("OnPosGetCard:", this.dataInfo);
		return true;
  }

	//打出一张牌后
  public OnPosOpCard(setPosInfo) {
		this.dataInfo = setPosInfo;
		console.log("OnPosOpCard:", this.dataInfo);
		return true;
  }

	//继续游戏需要清除之前的手牌记录
  public OnPosContinueGame() {
		this.dataInfo["handCard"] = 0;
		this.dataInfo["shouCard"] = [];
		this.dataInfo["buChuList"] = [];
		this.dataInfo["outCard"] = [];
		this.dataInfo["publicCardList"] = [];
		this.dataInfo["huCard"] = [];
  }

	//----------------获取接口----------------------
	//获取位置信息
  public GetSetPosInfo() {
		return this.dataInfo
  }

	//获取属性值
  public GetSetPosProperty(property) {
		if(!this.dataInfo.hasOwnProperty(property)){
			console.error("GetSetPosProperty(%s) error", property);
			return
		}
		return this.dataInfo[property];
  }
  public SetDataInfo(key,value) {
		this.dataInfo[key]=value;
  }

}
