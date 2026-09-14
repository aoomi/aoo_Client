// @ts-nocheck
// Generated from the Creator 2.2.2 AYPDK room model; method bodies and protocol semantics are preserved.
export type LegacyAypdkAppContext = Record<string, any>;
export class LegacyAypdkSetPosition {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAypdkAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app.subGameName.toUpperCase()+"SetPos";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.OnReload();
		this.Log("Init");
  }

  public OnReload() {
		this.dataInfo = {};
  }

	//-----------------------回调函数-----------------------------
	//开局初始化
  public OnInitSetPos(setPosInfo) {
		this.OnReload();
		this.dataInfo = setPosInfo;
		console.log("OnInitSetPos:", this.dataInfo);
  }

	//继续游戏需要清除之前的手牌记录
  public OnPosContinueGame() {
		this.OnReload();
  }

	//----------------获取接口----------------------
	//获取位置信息
  public GetSetPosInfo() {
		return this.dataInfo;
  }

	//获取属性值
  public GetSetPosProperty(property) {
		if(!this.dataInfo.hasOwnProperty(property)){
			this.ErrLog("GetSetPosProperty(%s) error", property);
			return
		}
		let shuxing = this.dataInfo[property];
		return this.dataInfo[property];
  }

}
