// @ts-nocheck
// Generated from the Creator 2.2.2 A3PK model. Method bodies and protocol semantics are preserved.
export type LegacyA3pkAppContext = Record<string, any>;

export class LegacyA3pkGameLogic {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyA3pkAppContext) { this.Init(); }

  public Init() {
        this.JS_Name = "LogicA3PKGame";

        this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
        this.WeChatManager = this.app[this.app.subGameName + "_WeChatManager"]();
        this.PokerCard = this.app[this.app.subGameName + "_PokerCard"]();
        this.A3PKRoomSet = this.app.A3PKRoomSet();
        this.A3PKRoom = this.app.A3PKRoom();
        this.A3PKDefine = this.app.A3PKDefine();

        //手牌
        this.handCardList = [];
        //选中的牌
        this.selectCardList = [];
        //上一个玩家出牌的牌型
        this.lastCardType = 0;
        this.lastKeyList=[];
        this.isSubSiteCard = false;
        this.lastCardValueList = [];
        this.cardTypeByPos = {
            pos: 0
        };

        this.Log("Init");

        this.pokerType = [
            0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,   //方块 2-A
            0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E,   //梅花 2-A
            0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E,   //红桃 2-A
            0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E,];//黑桃 2-A

        this.LOGIC_MASK_COLOR = 0xF0;
        this.LOGIC_MASK_VALUE = 0x0F;

        this.LOGIC_MASK_ZIMUA =14;     //老A
        this.LOGIC_MASK_SHUZI2 = 15;  //老二  
        this.LOGIC_MASK_XIAOWANG = 17; //小王
        this.LOGIC_MASK_DAWANG = 18;   //大王
        this.LOGIC_MASK_LAIZI = 19;    //癞子

        //打牌类型
        this.A3PK_CARD_TYPE_NOMARL = 0;            //默认状态
        this.A3PK_CARD_TYPE_BUCHU = 1;             //不出

        this.A3PK_CARD_TYPE_SINGLECARD = 2;            //单牌
        this.A3PK_CARD_TYPE_DUIZI = 3;             //对子
        this.A3PK_CARD_TYPE_3ZHANG = 4;             //3张
        this.A3PK_CARD_TYPE_4ZHANG = 5;             //4张
        this.A3PK_CARD_TYPE_SHUNZI = 6;              //顺子
        this.A3PK_CARD_TYPE_TONGHUA = 7;              //同花
        this.A3PK_CARD_TYPE_3DAI2 = 8;              //3带2
        this.A3PK_CARD_TYPE_4DAI1 = 9;              //4带1
        this.A3PK_CARD_TYPE_TONGHUASHUN = 10;              //同花顺
  }
  public InitHandCard(needSort = true) {
        this.selectCardList = [];
        this.lastCardType = this.A3PK_CARD_TYPE_NOMARL;
        this.lastCardList = [];
        this.lastCardValue = 0;
        this.lastCardColor = -1;
        this.handCardList = this.A3PKRoomSet.GetHandCard();
  }
  public ReSetHandCard() {
        this.handCardList = this.A3PKRoomSet.GetHandCard();
  }
  public GetLaiZiArr(pokers) {
        return [];
        /*let laiZiArr = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let color = this.GetCardColor(poker);
            if (color==64 && this.GetCardValue(poker)>16) {
                laiZiArr.push(poker);
            }
        }
        return laiZiArr;*/
  }

  public GuiLai() {
        /*let wangpai=this.A3PKRoom.GetRoomConfigByProperty("wangpai");
        if(wangpai==0){
            return true;
        }*/
        return false;
  }

  public SortCardByMax(pokers) {
        let self = this;
        pokers.sort(function (a, b) {
            //return (b&0x0F) - (a&0x0F);
            return self.GetCardValue(b) - self.GetCardValue(a);
        });
  }

  public SortCardByMin(pokers) {
        let self = this;
        pokers.sort(function (a, b) {
            //return (a&0x0F) - (b&0x0F);
            return self.GetCardValue(a) - self.GetCardValue(b);
        });
  }
  public SetPokerCard(cardList) {
        this.ChangeSelectCard([]);
        this.InitHandCard();
  }
  public CardColorToMatch(color) {
        if(color==48){
            return 3;
        }
        if(color==32){
            return 2;
        }
        if(color==0){
            return 1;
        }
        if(color==16){
            return 0;
        }
  }
  public isTongSe(cardList) {
        let laizi=0;
        let tongSeArray=new Array();
        tongSeArray[0]=0;
        tongSeArray[1]=0;
        tongSeArray[2]=0;
        tongSeArray[3]=0;
        for(let i=0;i<cardList.length;i++){
            let cardValue = this.GetCardValue(cardList[i]);
            let cardColor=this.GetCardColor(cardList[i]);
            if (cardColor==64 && cardValue==19) {
                laizi++;
                continue;
            }
            tongSeArray[this.CardColorToMatch(cardColor)]++;
        }
        if(tongSeArray[0]+laizi>=4){
            return true;
        }else if(tongSeArray[1]+laizi>=4){
            return true;
        }else if(tongSeArray[2]+laizi>=4){
            return true;
        }else if(tongSeArray[3]+laizi>=4){
            return true;
        }
        return false;
  }
  public GetHandCard(all=0) {
        if(all==0){
           return this.handCardList;
        }else if(all==1){
            let part1=[];
            for (let i = 0; i < this.handCardList.length; i++) {
                if(i>=28){
                    break;
                }
                part1.push(this.handCardList[i]);
            }
            return part1;
        }else if(all==2){
            let part2=[];
            for (let i = 0; i < this.handCardList.length; i++) {
                if(i>=28){
                    part2.push(this.handCardList[i]);
                }
            }
            return part2;
        }
  }

  public GetSelectCard() {
        return this.selectCardList;
  }

  public ChangeSelectCard(cardList) {
        this.selectCardList = [];
        this.selectCardList = cardList;

  }

  public SetCardSelected(cardIdx,SetCardSelected=false) {
        let cardType = this.handCardList[cardIdx - 1];
        this.selectCardList.push(cardType);
  }
  public GetCardType() {
        /*
        //打牌类型
        this.A3PK_CARD_TYPE_SINGLECARD = 2;            //单牌
        this.A3PK_CARD_TYPE_DUIZI = 3;             //对子
        this.A3PK_CARD_TYPE_3ZHANG = 4;             //3张
        this.A3PK_CARD_TYPE_4ZHANG = 5;             //4张
        this.A3PK_CARD_TYPE_SHUNZI = 6;              //顺子
        this.A3PK_CARD_TYPE_TONGHUA = 7;              //同花
        this.A3PK_CARD_TYPE_3DAI2 = 8;              //3带2
        this.A3PK_CARD_TYPE_4DAI1 = 9;              //4带1
        this.A3PK_CARD_TYPE_TONGHUASHUN = 10;              //同花顺
        */
        this.daiNum = 0;
        if (!this.selectCardList.length) {
            return 0;
        }
        let obRazzCard=false;
        let bCheck = false;
        
        if (this.lastCardType == 0) {
            obRazzCard=this.CheckOneCard();
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.CheckDuizi(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.Check3Zhang(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.Check4Zhang(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.Check5Zhang(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            /*obRazzCard=this.CheckShunZi(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.CheckTongHua(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.Check3Dai2(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.Check4Dai1(); 
            if (obRazzCard) {
                return obRazzCard;
            }
            obRazzCard=this.CheckTongHuaShun(); 
            if (obRazzCard) {
                return obRazzCard;
            }*/
            return 0;
        } 
        else if (this.lastCardType == this.A3PK_CARD_TYPE_SINGLECARD) {
            obRazzCard=this.CheckOneCard();
            if (obRazzCard) {
                bCheck = true;
            }
        } 
        else if (this.lastCardType == this.A3PK_CARD_TYPE_DUIZI) {
            obRazzCard=this.CheckDuizi();
            if (obRazzCard) {
                bCheck = true;
            }
        }else if (this.lastCardType == this.A3PK_CARD_TYPE_3ZHANG) {
            obRazzCard=this.Check3Zhang();
            if (obRazzCard) {
                bCheck = true;
            }
        }else if (this.lastCardType == this.A3PK_CARD_TYPE_4ZHANG) {
            obRazzCard=this.Check4Zhang();
            if (obRazzCard) {
                bCheck = true;
            }
        } 
        else if (this.lastCardType >= this.A3PK_CARD_TYPE_SHUNZI) {
            obRazzCard=this.Check5Zhang();
            if (obRazzCard) {
                bCheck = true;
            }
        }
        if (bCheck) {
            return obRazzCard;
        }
        return 0;
  }

  public CheckCanOut() {

        //判断是否有方块4
        if(this.handCardList.indexOf(4)>-1){
            //有方块4
            if(this.selectCardList.indexOf(4)==-1){
                //选中的牌没有4
                this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg("第一手牌中必须有方块4",[],3);
                return false;
            }
        }

        let cardType=this.GetCardType();
        if(cardType==0){
            return false;
        }
        if(this.lastCardType==0){
            return true;
        }
        let array = [];
        if (this.lastCardType == this.A3PK_CARD_TYPE_SINGLECARD) {
            array = this.GetOneCard(true);
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_DUIZI) {
            array = this.GetDuizi(true);
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_3ZHANG) {
            array = this.Get3Zhang(true);
        }  else if (this.lastCardType == this.A3PK_CARD_TYPE_4ZHANG) {
            array = this.Get4Zhang(true);
        }  else if (this.lastCardType >= this.A3PK_CARD_TYPE_SHUNZI) {
            array = this.Get5Zhang(true);
        } 

        if(array.length>0){
            return true;
        }else{
            return false;
        }
  }

  public GetTipCard() {
        let array =[];
        if (this.lastCardType == this.A3PK_CARD_TYPE_SINGLECARD) {
            array = this.GetOneCard();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_DUIZI) {
            array = this.GetDuizi();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_3ZHANG) {
            array = this.Get3Zhang();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_4ZHANG) {
            array = this.Get4Zhang();
        } else if (this.lastCardType >= this.A3PK_CARD_TYPE_SHUNZI) {
            array = this.Get5Zhang();
        } 
        else if (this.lastCardType == this.A3PK_CARD_TYPE_NOMARL) {
            array = this.GetOneCard();
        }
        //包含理排的放到提示的后面去
        return this.ReSortByLiPai(array);
        //return array;
  }
  public LiPaiCards() {
        let lipais = this.A3PKRoomSet.GetLiPais();
        if (lipais.length==0) {
            return [];
        }
        let newLipais = []; //所有理的牌
        for (let i = 0; i < lipais.length; i++) {
            for (let j = 0; j < lipais[i].length; j++) {
                newLipais.push(lipais[i][j]);
            }
        }
        return newLipais;
  }
  public ReSortByLiPai(array) {
        if(array==[]){
            return [];
        }
        let lipais = this.A3PKRoomSet.GetLiPais();
        if (lipais.length==0) {
            return array;
        }
        let newLipais = []; //所有理的牌
        for (let i = 0; i < lipais.length; i++) {
            for (let j = 0; j < lipais[i].length; j++) {
                newLipais.push(lipais[i][j]);
            }
        }
        let newArray=[];
        for(let i=0;i<array.length;i++){
            if(this.MatchLiPai(newLipais,array[i])==0){
                newArray.push(array[i]);
            }
        }
        //优先提示理好牌的510K
        for(let i=0;i<array.length;i++){
            if(this.isLiPai(lipais,array[i].cardList)==true && this.is510K(array[i].cardList)==true){
                newArray.push(array[i]);
            }
        }
        //其他情况
        for(let i=0;i<array.length;i++){
            if(this.isLiPai(lipais,array[i].cardList)==true && this.is510K(array[i].cardList)==true){
                //在楼上已经被取走
            }else{
                newArray.push(array[i]);
            }
        }
        return newArray;
  }
  public isLiPai(lipais,array) {
        let copyArray=this.copyArr(array);
        this.SortCardByMin(copyArray);
        let stringA=copyArray.toString();
        for(let i=0;i<lipais.length;i++){
            let copyLiPai=this.copyArr(lipais[i]);
            this.SortCardByMin(copyLiPai);
            if(copyLiPai.toString()==stringA){
                return true;
            }
        }
        return false;
  }
  public MatchLiPai(lipais,arrayObj) {
        let array=[];
        if(arrayObj["cardList"]){
            array=arrayObj["cardList"];
        }else{
            array=arrayObj;
        }
        let j=0;
        for(let i=0;i<array.length;i++){
            if(lipais.indexOf(array[i])>-1){
                j++;
            }
        }
        return j;
  }
  public GetFeiJiBuDai(isSelectCard=false) {
        /*let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        if(this.lastCardList.length==0 || this.lastCardList.length%3!=0){
            return false;
        }
        let planeLength=this.lastCardList.length/3;
        //列举出所有的可能飞机
        let tempPlane=[];
        for(let i=1;i<13;i++){  //老三到老A，最多11中情况
            if((this.lastCardValue+i)-planeLength<=14){
                tempPlane.push(this.lastCardValue+i-planeLength);
            }else{
                break;
            }
        }
        //所有的飞机列举出来，在过滤筛选
        let planetDi=[];//获取所有的飞机底牌
        for(let i=0;i<tempPlane.length;i++){
            let diPai=[];
            let val=tempPlane[i];
            let jia=1;
            diPai.push(val);diPai.push(val);diPai.push(val);
            while(jia<planeLength){
                let jiapai=val+jia;
                diPai.push(jiapai);diPai.push(jiapai);diPai.push(jiapai);
                jia++;
            }
            planetDi.push(diPai);
        }
        //过滤掉所有的不能用底牌
        let planetDi2=[];
        for(let i=0;i<planetDi.length;i++){
            let laiZiArr=this.GetLaiZiArr(pokers);
            let checkTemp=[];
            let pokerValues=planetDi[i];

            let isFull=true;

            for(let j=0;j<pokerValues.length;j++){
                let pokerValue=pokerValues[j];
                if(checkTemp.indexOf(pokerValue)==-1){
                    //没检测过
                    if(this.GetValueCount(pokers,pokerValue)==0){
                        //需要补三根
                        if(laiZiArr.length<3){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();laiZiArr.shift();laiZiArr.shift();
                    }
                    if(this.GetValueCount(pokers,pokerValue)==1){
                        //需要补三根
                        if(laiZiArr.length<2){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();laiZiArr.shift();
                    }
                    if(this.GetValueCount(pokers,pokerValue)==2){
                        //需要补三根
                        if(laiZiArr.length<1){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();
                    }
                }
                checkTemp.push(pokerValue);
            }
            if(isFull){
                planetDi2.push(planetDi[i]);
            }
        }
        let planetDi3=[];
        //所有够补牌的，再补上对子。如果牌不够补，优先刚好，然后补牌，然后拆炸弹
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取刚好的牌
            let checkTemp=[];
            let planePai=planetDi2[i];
            for(let j=0;j<planePai.length;j++){
                let cardValue=planePai[j];
                if(checkTemp.indexOf(cardValue)==-1){
                    //需要检查的排数
                    if(this.GetValueCount(pokers,cardValue)!=3){
                        break;
                    }
                }
                checkTemp.push(cardValue);
            }
            planetDi3.push(planetDi2[i]);
        }
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取癞子补牌
            let checkTemp=[];
            let planePai=planetDi2[i];
            let deng3Count=0;
            for(let j=0;j<planePai.length;j++){
                let cardValue=planePai[j];
                if(checkTemp.indexOf(cardValue)==-1){
                    //需要检查的排数
                    if(this.GetValueCount(pokers,cardValue)>3){ 
                        break;
                    }
                    if(this.GetValueCount(pokers,cardValue)==3){
                        deng3Count++;
                    }
                }
                checkTemp.push(cardValue);
            }
            if(planeLength>deng3Count){ //过滤掉，都是刚好3根的情况
                planetDi3.push(planetDi2[i]);
            }
        }
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取拆牌，把剩下的情况加到这里即可
            let checkTemp=[];
            let planePai=planetDi2[i];
            if(this.CheckArrayInArray(planetDi3,planePai)==false){
                planetDi3.push(planePai);
            }
        }
        //现在对有的底牌
        let realPlane=[];
        for(let i=0;i<planetDi3.length;i++){
            let pokersCopy=this.copyArr(pokers);
            let cardList=[];
            let substituteCard=[];
            let diPais=planetDi3[i];
            let laiZiArr=this.GetLaiZiArr(pokersCopy);
            for(let j=0;j<diPais.length;j++){
                let pai=diPais[j];
                let isGet=false;
                let pokersCopyLength=pokersCopy.length;
                for(let k=0;k<pokersCopyLength;k++){
                    if(this.GetCardValue(pokersCopy[k])==pai){
                        cardList.push(pokersCopy[k]);
                        pokersCopy.splice(k,1);
                        substituteCard.push(0);
                        isGet=true;
                        break;
                    }
                }
                if(isGet==false){
                    cardList.push(laiZiArr[0]);
                    substituteCard.push(pai);
                    laiZiArr.shift();
                }
            }
            realPlane.push({"opType":this.A3PK_CARD_TYPE_FEIJIBUDAI,"cardList":cardList,"substituteCard":substituteCard,"headList":diPais});
        }
        this.Get510KEx(realPlane,isSelectCard);
        this.GetZhaDanEx(realPlane,isSelectCard);
        if(realPlane.length>0){
            return realPlane;
        }
        return [];*/
  }
  public GetFeiJiDai2(isSelectCard=false) {
        /*let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        if(this.lastCardList.length==0){
            return false;
        }
        let planeLength= this.lastKeyList.length;
        //列举出所有的可能飞机
        let tempPlane=[];
        for(let i=1;i<11;i++){  //老三到老A，最多11中情况
            //if(this.lastCardValue+planeLength+1<=14){
            if((this.lastCardValue+i)+planeLength<=14){
                tempPlane.push(this.lastCardValue+i);
            }else{
                break;
            }
        }
        //所有的飞机列举出来，在过滤筛选
        let planetDi=[];//获取所有的飞机底牌
        for(let i=0;i<tempPlane.length;i++){
            let diPai=[];
            let val=tempPlane[i];
            let jia=1;
            diPai.push(val);diPai.push(val);diPai.push(val);
            while(jia<planeLength){
                let jiapai=val+jia;
                diPai.push(jiapai);diPai.push(jiapai);diPai.push(jiapai);
                jia++;
            }
            planetDi.push(diPai);
        }
        //过滤掉所有的不能用底牌
        let planetDi2=[];
        for(let i=0;i<planetDi.length;i++){
            let laiZiArr=[];
            if(this.GuiLai()==true){
                laiZiArr=this.GetLaiZiArr(pokers);
            }
            let checkTemp=[];
            let pokerValues=planetDi[i];

            let isFull=true;

            for(let j=0;j<pokerValues.length;j++){
                let pokerValue=pokerValues[j];
                if(checkTemp.indexOf(pokerValue)==-1){
                    //没检测过
                    if(this.GetValueCount(pokers,pokerValue)==0){
                        //需要补三根
                        if(laiZiArr.length<3){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();laiZiArr.shift();laiZiArr.shift();
                    }
                    if(this.GetValueCount(pokers,pokerValue)==1){
                        //需要补三根
                        if(laiZiArr.length<2){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();laiZiArr.shift();
                    }
                    if(this.GetValueCount(pokers,pokerValue)==2){
                        //需要补三根
                        if(laiZiArr.length<1){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();
                    }
                }
                checkTemp.push(pokerValue);
            }
            if(isFull){
                planetDi2.push(planetDi[i]);
            }
        }
        let planetDi3=[];
        //所有够补牌的，再补上对子。如果牌不够补，优先刚好，然后补牌，然后拆炸弹
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取刚好的牌
            let isFull=true;
            let checkTemp1=[];
            let planePai1=planetDi2[i];
            for(let j=0;j<planePai1.length;j++){
                let cardValue=planePai1[j];
                if(checkTemp1.indexOf(cardValue)==-1){
                    //需要检查的排数
                    if(this.GetValueCount(pokers,cardValue)!=3){
                        isFull=false;
                        break;
                    }
                }
                checkTemp1.push(cardValue);
            }
            if(isFull){
                planetDi3.push(planetDi2[i]);
            }
        }
        for(let i2=0;i2<planetDi2.length;i2++){
            //这轮循环，获取癞子补牌
            let checkTemp2=[];
            let planePai2=planetDi2[i2];
            let isQue=false;
            for(let j=0;j<planePai2.length;j++){
                let cardValue=planePai2[j];
                if(checkTemp2.indexOf(cardValue)==-1){
                    //需要检查的排数
                    let valueCount=this.GetValueCount(pokers,cardValue);
                    if(valueCount<3){
                        isQue=true;
                    }
                }
                checkTemp2.push(cardValue);
            }
            if(isQue){ //有需要补牌的
                planetDi3.push(planetDi2[i2]);
            }
        }
        for(let i3=0;i3<planetDi2.length;i3++){
            //这轮循环，获取拆牌，把剩下的情况加到这里即可
            let checkTemp=[];
            let planePai3=planetDi2[i3];
            if(this.CheckArrayInArray(planetDi3,planePai3)==false){
                planetDi3.push(planePai3);
            }
        }
        //现在对有的底牌，补上带的对子牌
        let realPlane=[];
        for(let i=0;i<planetDi3.length;i++){
            let pokersCopy=this.copyArr(pokers);
            let cardList=[];
            let substituteCard=[];
            let diPais=planetDi3[i];
            let laiZiArr=this.GetLaiZiArr(pokersCopy);
            for(let j=0;j<diPais.length;j++){
                let pai=diPais[j];
                let isGet=false;
                let pokersCopy2=this.copyArr(pokersCopy);
                for(let k=0;k<pokersCopy2.length;k++){
                    if(this.GetCardValue(pokersCopy[k])==pai){
                        cardList.push(pokersCopy[k]);
                        pokersCopy.splice(k,1);
                        substituteCard.push(0);
                        isGet=true;
                        break;
                    }
                }
                if(isGet==false){
                    if(laiZiArr.length==0){
                        break;
                    }
                    cardList.push(laiZiArr[0]);
                    substituteCard.push(pai);
                    laiZiArr.shift();
                }
            }
            if(cardList.length<planetDi3[0].length){
                continue;
            }
            //开始做补对子
            //尝试获取一个对子带牌，有的话直接返回
            let daipai=[];
            let duzi=[];
            let chai=[];
            let dan=[];
            let checkTemp3=[];
            for (let j=0;j<pokersCopy.length;j++) {
                let poker = pokersCopy[j];
                let cardValue=this.GetCardValue(poker);
                if(cardValue>16){
                    continue;
                }
                if(checkTemp3.indexOf(cardValue)>-1){
                    continue;
                }
                checkTemp3.push(cardValue);
                let cards = this.GetSameValue(pokersCopy, poker);
                if (cards.length == 2) {
                    duzi.push(cards[0]);
                    duzi.push(cards[1]);
                }else if(cards.length>2){
                    while(cards.length>0){
                        chai.push(cards[0]);
                        cards.shift();
                    }
                }else if(cards.length==1){
                    dan.push(cards[0]);
                }
            }
            daipai.push.apply(daipai,dan);
            daipai.push.apply(daipai,duzi);
            daipai.push.apply(daipai,chai);
            for (let j=0;j<daipai.length;j++) {
                let dp=daipai[j];
                cardList.push(dp);
                substituteCard.push(0);
                if(cardList.length>=planeLength*5){
                    //飞机长度够了
                    break;
                }
            }
            if(cardList.length%5==0 || this.handCardList.length==cardList.length){
                //最后一手也可以
                realPlane.push({"opType":this.A3PK_CARD_TYPE_FEIJIDAI2,"cardList":this.copyArr(cardList),"substituteCard":this.copyArr(substituteCard),"headList":this.copyArr(diPais)});
            }
            
        }
        this.Get510KEx(realPlane,isSelectCard);
        this.GetZhaDanEx(realPlane,isSelectCard);
        if(realPlane.length>0){
            return realPlane;
        }
        return false;*/
  }
    CheckArrayInArray(arrays,array){
        let arrayString=array.join(",");
        for(let i=0;i<arrays.length;i++){
            let checkArrayString=arrays[i].join(",");
            if(checkArrayString==arrayString){
                return true;
            }
        }
        return false;
  }
    
  public GetSanBuDai(isSelectCard=false) {
        let pokers = [];
        let myPokers=[];
        if(isSelectCard==false){
            mypokers=this.copyArr(this.handCardList);
        }else{
            mypokers=this.copyArr(this.selectCardList);
        }

        pokers=this.copyArr(myPokers);
        this.SortCardByMin(pokers);
        let santiaos = [];
        let chai = [];
        let razz = [];
        let laiZiArr = this.GetLaiZiArr(pokers);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue==this.LOGIC_MASK_LAIZI) {
                continue;
            }
            if (cardValue <= this.lastCardValue) continue;
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(santiaos, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            let obRazzCard=false;
            if (santiao.length == 3 && !bInList) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3BUDAI,"cardList":santiao,"substituteCard":[0,0,0]};
                if(obRazzCard){
                    santiaos.push(obRazzCard);
                }
            } else if (santiao.length > 3 && !bInListEx) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3BUDAI,"cardList":[santiao[0],santiao[1],santiao[2]],"substituteCard":[0,0,0]};
                if(obRazzCard){
                    chai.push(obRazzCard);
                }
            } else if (laiZiArr.length >= 1 && santiao.length == 2) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3BUDAI,"cardList":[santiao[0],santiao[1],laiZiArr[0]],"substituteCard":[0,0,this.GetCardValue(santiao[0])]};
                if(obRazzCard){
                    razz.push(obRazzCard);
                }
            } else if (laiZiArr.length >= 2 && santiao.length == 1) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3BUDAI,"cardList":[santiao[0],laiZiArr[1],laiZiArr[1]],"substituteCard":[0,this.GetCardValue(santiao[0]),this.GetCardValue(santiao[0])]};
                if(obRazzCard){
                    razz.push(obRazzCard);
                }
            } 
        }
        this.Get510KEx(santiaos,isSelectCard);
        this.GetZhaDanEx(santiaos,isSelectCard);
        santiaos.push.apply(santiaos, razz);
        santiaos.push.apply(santiaos, chai);
        return santiaos;
  }
  public GetSanDai2(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let santiaos = [];
        let chai = [];
        let razz = [];
        this.SortCardByMin(pokers);
        let laiZiArr =[];
        /*if(this.GuiLai()==true){
            laiZiArr = this.GetLaiZiArr(pokers);
        }*/
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            /*if (cardValue>15) {
                continue; //癞子本身不能做基牌
            }*/
            if (cardValue <= this.lastCardValue) continue;
            let santiao = this.GetSameValueAndGui(pokers, poker);
            let bInList = this.CheckPokerInListEx(santiaos, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            let obRazzCard=false;
            if (santiao.length == 3 && !bInList) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":santiao,"substituteCard":[0,0,0]};
                this.SanDaiBuPai(pokers,obRazzCard);
                if(obRazzCard){
                    santiaos.push(obRazzCard);
                }
            } else if (santiao.length > 3 && !bInListEx) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":[santiao[0],santiao[1],santiao[2]],"substituteCard":[0,0,0]};
                this.SanDaiBuPai(pokers,obRazzCard);
                if(obRazzCard){
                    chai.push(obRazzCard);
                }
            } else if (laiZiArr.length >= 1 && santiao.length == 2 && this.GetCardValue(santiao[0])<16) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":[santiao[0],santiao[1],laiZiArr[0]],"substituteCard":[0,0,this.GetCardValue(santiao[0])]};
                this.SanDaiBuPai(pokers,obRazzCard);
                if(obRazzCard){
                    razz.push(obRazzCard);
                }
            } else if (laiZiArr.length >= 2 && santiao.length == 1 && this.GetCardValue(santiao[0])<16) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":[santiao[0],laiZiArr[1],laiZiArr[1]],"substituteCard":[0,this.GetCardValue(santiao[0]),this.GetCardValue(santiao[0])]};
                this.SanDaiBuPai(pokers,obRazzCard);
                if(obRazzCard){
                    razz.push(obRazzCard);
                }
            } 
        }/*
        this.SortCardByMin(santiaos);
        this.SortCardByMin(chai);
        this.SortCardByMin(razz);
*/
        this.Get510KEx(santiaos,isSelectCard);
        this.GetZhaDanEx(santiaos,isSelectCard);
        santiaos.push.apply(santiaos, razz);
        santiaos.push.apply(santiaos, chai);
        return santiaos;
  }
  public SanDaiBuPai(pokers,obRazzCard) {
        let pokersCopy = this.copyArr(pokers);
        let cardList=obRazzCard.cardList;
        let substituteCard=obRazzCard.substituteCard;
        for(let i=0;i<cardList.length;i++){
            let pos=pokersCopy.indexOf(cardList[i]);
            if (pos != -1) {
                pokersCopy.splice(pos,1);
            }
        }
        this.SortCardByMin(pokersCopy);
        let laiZiArr = this.GetLaiZiArr(pokersCopy);
        //尝试获取一个对子带牌，有的话直接返回
        let daipai=[];
        let duizi=[];
        let chai=[];
        let dan=[];
        for (let i=0;i<pokersCopy.length;i++) {
            let poker = pokers[i];
            let cardValue=this.GetCardValue(poker);
            let bInList = cardList.indexOf(poker);
            if(bInList>-1){
                continue;
            }
            if(cardValue>15){
                continue;
            }
            let cards = this.GetSameValue(pokers, poker);
            if (cards.length == 2) {
                duizi.push(cards);
            }else if(cards.length>2){
                chai.push(cards);
            }else if(cards.length==1){
                dan.push(cards[0]);
            }
        }
        if(dan.length>=2){
            //取第一个对子出去就可以了带最小单根小排出去
            cardList.push(dan[0]);cardList.push(dan[1]);
            substituteCard.push(0);
            substituteCard.push(0);
            return obRazzCard;
        }
        if(duizi.length>0){
            //取第一个对子出去就可以了,优先带对子
            cardList.push(duizi[0][0]);cardList.push(duizi[0][1]);
            substituteCard.push(0);substituteCard.push(0);
            return obRazzCard;
        }
        if(chai.length>0){
            this.SortCardByLength(chai);
            //取第一个对子出去就可以了,优先带长度小的对子
            cardList.push(chai[0][0]);cardList.push(chai[0][1]);
            substituteCard.push(0);substituteCard.push(0);
            return obRazzCard;
        }
        if(cardList.length==4 && laiZiArr.length==1){
            cardList.push(laiZiArr[0]);
            substituteCard.push(this.GetCardValue(cardList[3]));
            return obRazzCard;
        }
        if(cardList.length<5 && this.handCardList.length>=5){
            return false; //不是最后一手牌
        }
        return obRazzCard;
  }
  public SortCardByLength(pokers) {
        pokers.sort(function (a, b) {
            return a.length - b.length;
        });
  }
  public GetDuizi(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let duizis = [];
        let chai = [];
        let razz = [];
        let laiZiArr = [];
        
        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue < this.lastCardValue || cardValue>=16) { //大小王不是对子
                continue;
            }
            let cardColor = this.GetCardColor(poker);
            if (cardValue==this.lastCardValue && cardColor<this.lastCardColor) {
                continue;
            }
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(duizis, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            let obRazzCard=false;
            if (duizi.length == 2 && !bInList) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_DUIZI,"cardList":duizi,"substituteCard":[0,0]};
                duizis.push(obRazzCard);
            } else if (duizi.length > 2 && !bInListEx) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_DUIZI,"cardList":[duizi[0],duizi[1]],"AllCardList":duizi,"substituteCard":[0,0]};
                chai.push(obRazzCard);
            }
        }
        duizis.push.apply(duizis, chai);
        return duizis;
  }
  public Get3Zhang(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let duizis = [];
        let chai = [];
        let razz = [];
        let laiZiArr = [];
        
        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue <= this.lastCardValue) {
                //癞子牌也跳过
                continue;
            }
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(duizis, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            let obRazzCard=false;
            if (duizi.length == 3 && !bInList) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3ZHANG,"cardList":duizi,"substituteCard":[0,0,0]};
                duizis.push(obRazzCard);
            } else if (duizi.length > 3 && !bInListEx) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_3ZHANG,"cardList":[duizi[0],duizi[1],duizi[2]],"substituteCard":[0,0,0]};
                chai.push(obRazzCard);
            }
        }
        duizis.push.apply(duizis, chai);
        return duizis;
  }
  public Get4Zhang(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let duizis = [];
        let laiZiArr = [];
        
        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue <= this.lastCardValue || cardValue==this.LOGIC_MASK_LAIZI) {
                //癞子牌也跳过
                continue;
            }
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(duizis, poker);
            let obRazzCard=false;
            if (duizi.length == 4 && !bInList) {
                obRazzCard={"opType":this.A3PK_CARD_TYPE_4ZHANG,"cardList":duizi,"substituteCard":[0,0,0,0]};
                duizis.push(obRazzCard);
            }
        }
        return duizis;
  }
  public Get5Zhang(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        //穷尽5张
        let lists=[];
        if(this.lastCardType<=this.A3PK_CARD_TYPE_SHUNZI){
            let shunzi=this.GetShunZi(isSelectCard);
            lists.push.apply(lists,shunzi);
        }
        if(this.lastCardType<this.A3PK_CARD_TYPE_TONGHUA){
            let tonghua=this.GetTongHua(isSelectCard);
            lists.push.apply(lists,tonghua);
        }

        if(this.lastCardType<=this.A3PK_CARD_TYPE_3DAI2){
            let sandai2=this.Get3Dai2(isSelectCard);
            lists.push.apply(lists,sandai2);
        }

        if(this.lastCardType<=this.A3PK_CARD_TYPE_4DAI1){
            let sidai1=this.Get4Dai1(isSelectCard);
            lists.push.apply(lists,sidai1);
        }
        if(this.lastCardType<=this.A3PK_CARD_TYPE_TONGHUASHUN){
            let tonghuashun=this.GetTongHuaShun(isSelectCard);
            lists.push.apply(lists,tonghuashun);
        }
        return lists;
  }
  public Get4Dai1(isSelectCard=false) {
        let sidaiArray=[];
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        this.SortCardByMin(pokers);
        let danPai=0;
        let sitiaoArray=[];
        //let santiao = this.GetSameValueAndGui(pokers, poker);
        for(let i=0;i<pokers.length;i++){
            let poker=pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if(duizi.length==1 && danPai==0){
                danPai=poker; //默认用最小的对子就够了
            }else if(duizi.length==4){
                let bInList = this.CheckPokerInList(sitiaoArray, poker);
                if (bInList){
                    continue;
                }
                sitiaoArray.push(duizi);
            }
        }
        if(danPai==0){
            for(let i=0;i<pokers.length;i++){
                let poker=pokers[i];
                let bInList = this.CheckPokerInList(sitiaoArray, poker);
                if (!bInList){
                    danPai=poker;
                    break;
                }
            }
        }
        if(danPai==0){
            return [];
        }
        if(sitiaoArray.length>0){
            for(let i=0;i<sitiaoArray.length;i++){
                let cards=this.copyArr(sitiaoArray[i]);
                cards.push(danPai);
                if(this.lastCardType==this.A3PK_CARD_TYPE_4DAI1){
                    if(this.lastCardValue>this.GetCardValue(cards[0])){
                        continue;
                    }
                }
                sidaiArray.push({"opType":this.A3PK_CARD_TYPE_4DAI1,"cardList":cards,"substituteCard":[0,0,0,0,0]});
            }
            return sidaiArray;
        }
        return [];
  }
  public Get3Dai2(isSelectCard=false) {
        let sandaiArray=[];
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        this.SortCardByMin(pokers);
        let duiziArray=[];
        let santiaoArray=[];
        //let santiao = this.GetSameValueAndGui(pokers, poker);
        for(let i=0;i<pokers.length;i++){
            let poker=pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if(duizi.length==2 && duiziArray.length==0){
                duiziArray.push(duizi); //默认用最小的对子就够了
            }else if(duizi.length==3){
                let bInList = this.CheckPokerInList(santiaoArray, poker);
                if (bInList){
                    continue;
                }
                santiaoArray.push(duizi);
            }
        }
        if(santiaoArray.length>0 && duiziArray.length>0){
            for(let i=0;i<santiaoArray.length;i++){
                let cards=this.copyArr(santiaoArray[i]);
                cards.push(duiziArray[0][0]);
                cards.push(duiziArray[0][1]);
                if(this.lastCardType==this.A3PK_CARD_TYPE_3DAI2){
                    if(this.lastCardValue>this.GetCardValue(cards[0])){
                        continue;
                    }
                }
                sandaiArray.push({"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":cards,"substituteCard":[0,0,0,0,0]});
            }
        }else if(santiaoArray.length>1){
            //拆两个3条的情况，最小的3条默认做对子
            for(let i=1;i<santiaoArray.length;i++){
                let cards=this.copyArr(santiaoArray[i]);
                cards.push(santiaoArray[0][0]);
                cards.push(santiaoArray[0][1]);
                if(this.lastCardType==this.A3PK_CARD_TYPE_3DAI2){
                    if(this.lastCardValue>this.GetCardValue(cards[0])){
                        continue;
                    }
                }
                sandaiArray.push({"opType":this.A3PK_CARD_TYPE_3DAI2,"cardList":cards,"substituteCard":[0,0,0,0,0]});
            }
        }
        return sandaiArray;
  }
  public GetTongHua(isSelectCard=false) {
        let tongArray=[];
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        this.SortCardByMin(pokers);
        let dan0=[];
        let dan16=[];
        let dan32=[];
        let dan48=[];

        let duo0=[];
        let duo16=[];
        let duo32=[];
        let duo48=[];
        for(let i=0;i<pokers.length;i++){
            let poker=pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            let color=this.GetCardColor(poker);
            if(duizi.length==1){
                if(color==0){
                    dan0.push(poker);
                }else if(color==16){
                    dan16.push(poker);
                }else if(color==32){
                    dan32.push(poker);
                }else if(color==48){
                    dan48.push(poker);
                }
            }else{
                if(color==0){
                    duo0.push(poker);
                }else if(color==16){
                    duo16.push(poker);
                }else if(color==32){
                    duo32.push(poker);
                }else if(color==48){
                    duo48.push(poker);
                }
            }
        }
        if(dan0.length>=5){
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":[dan0[0],dan0[1],dan0[2],dan0[3],dan0[4]],"substituteCard":[0,0,0,0,0]});
        }
        if(dan16.length>=5){
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":[dan16[0],dan16[1],dan16[2],dan16[3],dan16[4]],"substituteCard":[0,0,0,0,0]});
        }
        if(dan32.length>=5){
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":[dan32[0],dan32[1],dan32[2],dan32[3],dan32[4]],"substituteCard":[0,0,0,0,0]});
        }
        if(dan48.length>=5){
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":[dan48[0],dan48[1],dan48[2],dan48[3],dan48[4]],"substituteCard":[0,0,0,0,0]});
        }

        if(dan0.length<5 && dan0.length+duo0.length>=5){
            let mul0=[];
            for(let i=0;i<5;i++){
                if(dan0.length>0){
                    mul0.push(dan0[0]);
                    dan0.shift();
                    continue;
                }else{
                    mul0.push(duo0[0]);
                    duo0.shift();
                }
            }
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":mul0,"substituteCard":[0,0,0,0,0]});
        }
        if(dan16.length<5 && dan16.length+duo16.length>=5){
            let mul16=[];
            for(let i=0;i<5;i++){
                if(dan16.length>0){
                    mul16.push(dan16[0]);
                    dan16.shift();
                    continue;
                }else{
                    mul16.push(duo16[0]);
                    duo16.shift();
                }
            }
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":mul16,"substituteCard":[0,0,0,0,0]});
        }
        if(dan32.length<5 && dan32.length+duo32.length>=5){
            let mul32=[];
            for(let i=0;i<5;i++){
                if(dan32.length>0){
                    mul32.push(dan32[0]);
                    dan32.shift();
                    continue;
                }else{
                    mul32.push(duo32[0]);
                    duo32.shift();
                }
            }
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":mul32,"substituteCard":[0,0,0,0,0]});
        }
        if(dan48.length<5 && dan48.length+duo48.length>=5){
            let mul48=[];
            for(let i=0;i<5;i++){
                if(dan48.length>0){
                    mul48.push(dan48[0]);
                    dan48.shift();
                    continue;
                }else{
                    mul48.push(duo48[0]);
                    duo48.shift();
                }
            }
            tongArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUA,"cardList":mul48,"substituteCard":[0,0,0,0,0]});
        }
        return tongArray;
  }
  public GetTongHuaShun(isSelectCard=false) {
        let shunziArray=[];
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let shunZiHead=[];
        let kexuanwanfa = this.A3PKRoom.GetRoomConfigByProperty("kexuanwanfa");
        if(kexuanwanfa.indexOf(0)==-1){
            //有A玩法
            shunZiHead.push([14,15,15.5,4,5]);
        }
        shunZiHead.push([15,15.5,4,5,6]);
        shunZiHead.push([15.5,4,5,6,7]);
        shunZiHead.push([4,5,6,7,8]);
        shunZiHead.push([5,6,7,8,9]);
        shunZiHead.push([6,7,8,9,10]);
        shunZiHead.push([7,8,9,10,11]);
        shunZiHead.push([8,9,10,11,12]);
        shunZiHead.push([9,10,11,12,13]);
        if(kexuanwanfa.indexOf(0)==-1){
            //有A玩法
            shunZiHead.push([10,11,12,13,14]);
        }
        //计算可用的排头
        let useHead=[];
        for(let i=0;i<shunZiHead.length;i++){
            if(this.lastCardType==this.A3PK_CARD_TYPE_TONGHUASHUN){
                if(shunZiHead[i][4]>=this.lastCardValue){
                    useHead.push(shunZiHead[i]);
                }
            }else{
                useHead.push(shunZiHead[i]);
            }
        }
        //分别尝试获取4个花色的同花顺
        for(let i=0;i<useHead.length;i++){
            let pks0=this.GetSameColorValueCardFormPokers(pokers,useHead[i],0);
            if(pks0.length>0){
                shunziArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUASHUN,"cardList":pks0,"substituteCard":[0,0,0,0,0]});
            }
            let pks16=this.GetSameColorValueCardFormPokers(pokers,useHead[i],16);
            if(pks16.length>0){
                shunziArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUASHUN,"cardList":pks16,"substituteCard":[0,0,0,0,0]});
            }
            let pks32=this.GetSameColorValueCardFormPokers(pokers,useHead[i],32);
            if(pks32.length>0){
                shunziArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUASHUN,"cardList":pks32,"substituteCard":[0,0,0,0,0]});
            }
            let pks48=this.GetSameColorValueCardFormPokers(pokers,useHead[i],48);
            if(pks48.length>0){
                shunziArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUASHUN,"cardList":pks48,"substituteCard":[0,0,0,0,0]});
            }
        }
        return shunziArray;

  }
  public GetSameColorValueCardFormPokers(pokers,values,color) {
        let pks=[];
        for(let i=0;i<values.length;i++){
            for(let j=0;j<pokers.length;j++){
                let vl=this.GetCardValue(pokers[j]);
                let col=this.GetCardColor(pokers[j]);
                if(values[i]==vl && col==color){
                    pks.push(pokers[j]);
                    break;
                }
            }
        }
        if(pks.length==values.length){
            if(values[4]>this.lastCardValue){
                return pks;
            }else if(values[4]==this.lastCardValue && color>this.lastCardColor){
                return pks;
            }
        }
        return [];
  }
    /*
    * 这个函数紧顺子可用
    */
  public GetValueCardFormPokers(pokers,values) {
        let pks=[];
        for(let i=0;i<values.length;i++){
            for(let j=0;j<pokers.length;j++){
                let vl=this.GetCardValue(pokers[j]);
                if(i==values.length-1 && this.lastCardValue==values[i]){
                    //相同顺子，比较花色。恶心死了
                    let col=this.GetCardColor(pokers[j]);
                    if(col>this.lastCardColor && values[i]==vl){
                        pks.push(pokers[j]);
                        break;
                    }
                }else{
                    if(values[i]==vl){
                        pks.push(pokers[j]);
                        break;
                    }
                }
            }
        }
        if(pks.length==values.length){
            return pks;
        }
        return [];
  }
  public GetShunZi(isSelectCard=false) {
        let shunziArray=[];
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let shunZiHead=[];
        let kexuanwanfa = this.A3PKRoom.GetRoomConfigByProperty("kexuanwanfa");
        if(kexuanwanfa.indexOf(0)==-1){
            //有A玩法
            shunZiHead.push([14,15,3,4,5]);
        }
        shunZiHead.push([15,3,4,5,6]);
        shunZiHead.push([3,4,5,6,7]);
        shunZiHead.push([4,5,6,7,8]);
        shunZiHead.push([5,6,7,8,9]);
        shunZiHead.push([6,7,8,9,10]);
        shunZiHead.push([7,8,9,10,11]);
        shunZiHead.push([8,9,10,11,12]);
        shunZiHead.push([9,10,11,12,13]);
        if(kexuanwanfa.indexOf(0)==-1){
            //有A玩法
            shunZiHead.push([10,11,12,13,14]);
        }
        //计算可用的排头
        let useHead=[];
        for(let i=0;i<shunZiHead.length;i++){
            if(shunZiHead[i][4]>=this.lastCardValue){
                useHead.push(shunZiHead[i]);
            }
        }
        //获取牌过来补充
        for(let i=0;i<useHead.length;i++){
            let pks=this.GetValueCardFormPokers(pokers,useHead[i]);
            if(pks.length>0){
                if(this.isTongHua(pks)){
                    shunziArray.push({"opType":this.A3PK_CARD_TYPE_TONGHUASHUN,"cardList":pks,"substituteCard":[0,0,0,0,0]});
                }else{
                    shunziArray.push({"opType":this.A3PK_CARD_TYPE_SHUNZI,"cardList":pks,"substituteCard":[0,0,0,0,0]});
                }
            }
        }
        return shunziArray;
  }
    
  public GetOneCard(isSelectCard=false) {
        if (this.lastCardType == this.A3PK_CARD_TYPE_NOMARL){
            //判断是否有方块4
            if(this.handCardList.indexOf(4)>-1){
                //有方块4
                return [{"opType":this.A3PK_CARD_TYPE_SINGLECARD,"cardList":[4],"substituteCard":[0]}];
            }
        }
        let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let array = [];
        let checkArray = [];
        let dan=[];
        let chai=[];
        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if(checkArray.indexOf(cardValue)>-1){
                continue;
            }
            if (cardValue <this.lastCardValue) {
                continue;
            }
            let cardColor = this.GetCardColor(poker);
            if (cardValue==this.lastCardValue && cardColor<this.lastCardColor) {
                continue;
            }
            let sameValue = this.GetSameValueAndGui(pokers, poker);
            let obRazzCard={"opType":this.A3PK_CARD_TYPE_SINGLECARD,"cardList":[poker],"substituteCard":[0]};
            if (sameValue.length == 1) {
                dan.push(obRazzCard);
            } else if (sameValue.length > 1) {
                chai.push(obRazzCard);
            }
            checkArray.push(cardValue);
        }
        array.push.apply(array,dan);
        array.push.apply(array,chai);
        return array;
  }

  public CheckFeiJiBuDai() {
       
  }
  public CheckFeiJiDai2() {
        
  }
  public GetFeijiBuBuDai(pokers,heads) {
       
  }
  public GetFeijiBu(pokers,heads) {
       
  }
  public CheckFeijiBu(pokers,heads) {
       
  }
  public pokersValueCount(values,value) {
        let count=0;
        for(let i=0;i<values.length;i++){
            if(value==values[i]){
                count++;
            }
        }
        return count;
  }
  public Check3BuDai() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 3){
            return false;
        }
        if (this.lastCardList.length>0 && (this.lastCardList.length != pokers.length)){
            return false;
        }
        let laiZiArr = this.GetLaiZiArr(pokers);
        if(laiZiArr.length==3){
            return false; //全部都是鬼牌了，只能去跟别人一起
        }
        if(this.GetDifferenceValueCount(pokers)>1){
            return  false; //牌值不止一个，肯定不是3不带
        }
        this.SortCardByMin(pokers);
        let cardList=[];
        let substituteCard=[];
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_3BUDAI,
            "cardList": [],
            "substituteCard": [],
        };
        let myCardValue=this.GetCardValue(pokers[0]);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if(pokerValue==this.LOGIC_MASK_LAIZI){
                cardList.push(laiZiArr[0]);
                substituteCard.push(myCardValue);
                laiZiArr.shift();
            }else{
                cardList.push(poker);
                substituteCard.push(0);
            }
        }
        if (this.lastCardValue && this.lastCardValue != 0) {//上家有出牌
            if (myCardValue <= this.lastCardValue) {
                return false;
            }
        }
        obRazzCard.cardList=cardList;
        obRazzCard.substituteCard=substituteCard;
        return obRazzCard;

  }
    /*
    * 3带2
    */
  public Check3Dai2() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length >5){
            return false;
        }
        if (pokers.length != 5 && this.handCardList.length>pokers.length){
            return false;
        }
        if(pokers.length<3){
            return false;
        }
        /*if (this.lastCardList.length>0 && (this.lastCardList.length != pokers.length)){
            return false;
        }*/
        let laiZiArr =[];
        if(laiZiArr.length==4){
            return false; //全部都是鬼牌了，只能当做炸弹了
        }
        if(this.handCardList.length==3 && pokers.length==3){
            //3根小王，三根大王
            if(this.GetCardValue(pokers[0])==this.GetCardValue(pokers[1]) && this.GetCardValue(pokers[0])==this.GetCardValue(pokers[2])){
                return {
                    "opType": this.A3PK_CARD_TYPE_3DAI2,
                    "cardList":pokers,
                    "substituteCard": [0,0,0],
                };
            }
        }
        let myCardValue = 0;
        let tempArrB = [];
        let substituteCard=[];
        this.SortCardByMin(pokers);
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_3DAI2,
            "cardList": [],
            "substituteCard": [],
        };

        if(laiZiArr.length==0){
            //正常情况，没有癞子
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                let samePoker = this.GetSameValueAndGui(pokers, poker);
                if (samePoker.length >= 3) {
                    tempArrB.push(samePoker[0]);
                    tempArrB.push(samePoker[1]);
                    tempArrB.push(samePoker[2]);
                    myCardValue=this.GetCardValue(samePoker[0]);
                    break;
                }
            }
            if(tempArrB.length<3){
                return false;
            }
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                if(tempArrB.indexOf(poker)==-1){
                    tempArrB.push(poker);
                }
                /*let samePoker = this.GetSameValue(pokers, poker);
                if (samePoker.length >0) {
                    tempArrB.push(samePoker[0]);
                    tempArrB.push(samePoker[1]);
                    break;
                }*/
            }
            if ((this.GetCardValue(tempArrB[0]) <= this.lastCardValue) && this.lastCardValue>0) {
                return false;
            }
            obRazzCard.cardList=tempArrB;
            obRazzCard.substituteCard=substituteCard;
            return obRazzCard;
        }else{
            this.SortCardByMax(pokers);
            if(laiZiArr.length==3){
                tempArrB=pokers;
                for (let i = 0; i < pokers.length; i++) {
                    substituteCard.push(0);
                }
                obRazzCard.cardList=tempArrB;
                obRazzCard.substituteCard=substituteCard;
                return obRazzCard;
            }
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                if(this.PokerCard.GetCardValue(poker)>15){
                    //是鬼牌,不能做主牌
                    continue;
                }
                let samePoker = this.GetSameValue(pokers, poker);
                if (samePoker.length==1 && laiZiArr.length==2) {
                    tempArrB.push(samePoker[0]);
                    substituteCard.push(0);
                    tempArrB.push(laiZiArr[0]);
                    substituteCard.push(this.GetCardValue(poker));
                    tempArrB.push(laiZiArr[1]);
                    substituteCard.push(this.GetCardValue(poker));
                    laiZiArr.shift();
                    laiZiArr.shift();
                    break;
                }else if (samePoker.length==2 && laiZiArr.length==1) {
                    tempArrB.push(samePoker[0]);
                    substituteCard.push(0);
                    tempArrB.push(samePoker[1]);
                    substituteCard.push(0);
                    tempArrB.push(laiZiArr[0]);
                    substituteCard.push(this.GetCardValue(poker));
                    laiZiArr.shift();
                    break;
                }else if (samePoker.length>=3) {
                    tempArrB.push(samePoker[0]);
                    substituteCard.push(0);
                    tempArrB.push(samePoker[1]);
                    substituteCard.push(0);
                    tempArrB.push(samePoker[2]);
                    substituteCard.push(0);
                    break;
                }
            }
            if(tempArrB.length<3){
                return false;
            }
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                if(tempArrB.indexOf(poker)==-1){
                    tempArrB.push(poker);
                }
            }
            if ((this.GetCardValue(tempArrB[0]) <= this.lastCardValue) && this.lastCardValue>0) {
                return false;
            }
            obRazzCard.cardList=tempArrB;
            obRazzCard.substituteCard=substituteCard;
            return obRazzCard;
        }
  }


  public CheckShunZi() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length < 5){
            return false;
        }
        if (this.lastCardValue == 10) {
            return false;  //最小的牌已经是10了，不可能再比他大了
        }
        if (this.lastCardList.length>0 && (this.lastCardList.length != pokers.length)) {
            return false;
        }
        /*if (this.IsShuZi2Gui(pokers)) {
            //包含二不能组成顺子，大鬼小鬼
           return false;
        }*/
        for (let i = 0; i < pokers.length; i++) {
            let poker=pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if (duizi.length >= 2){
                return false;//顺子中有一样的牌，肯定不是顺子
            }
            if(this.GetCardValue(poker)==15){
                return false; //顺子中不可能有2
            }
        }
        this.SortCardByMin(this.lastCardList);
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_SHUNZI,
            "cardList": [],
            "substituteCard": [],
        };
        let cardList=[];
        let substituteCard=[];
        let laiZiArr = [];
        this.SortCardByMin(pokers);
        let normalPokers = this.GetNormalPokers(pokers);
        //最大到老A，最小老三
        this.SortCardByMin(normalPokers);
        let lastValue = 0;
        let maxValue=0;
        let minValue=0;
        for (let i = 0; i < normalPokers.length; i++) {
            let poker=normalPokers[i];
            let nowValue = this.GetCardValue(poker);
            if(minValue==0){
                minValue=nowValue;
            }else if(minValue>nowValue){
                minValue=nowValue;
            }
            if(maxValue==0){
                maxValue=nowValue;
            }else if(maxValue<nowValue){
                maxValue=nowValue;
            }
            //更新最大牌，最小牌
            if (lastValue != 0) {
                if (nowValue - lastValue != 1) {
                    let buPai=nowValue-lastValue;
                    let jian=1;
                    while(buPai>1){
                        if(laiZiArr.length>0){
                            cardList.push(laiZiArr[0]);
                            laiZiArr.shift();   //癞子删掉一个牌
                            substituteCard.push(nowValue-jian);
                        }else{
                            return false; //没有癞子可以替换了，直接返回不是顺子
                        }
                        buPai--;
                        jian++;
                    }
                }
                cardList.push(poker);
                substituteCard.push(0);
            }else{
                cardList.push(poker);
                substituteCard.push(0);
            }
            lastValue=nowValue;
        }
        if(laiZiArr.length>0){
            //还有剩下癞子，往上补牌
            let buDa=1;
            while(laiZiArr.length>0){
                let buDaValue=maxValue+buDa;
                if(buDaValue>14){
                    break;
                }
                cardList.push(laiZiArr[0]);
                laiZiArr.shift();   //癞子删掉一个牌
                substituteCard.push(buDaValue);
                buDa++;
            }
            //还有剩下癞子，往下补牌
            let buXiao=1;
            while(laiZiArr.length>0){
                let buXiaoValue=minValue-buXiao;
                if(buXiaoValue<3){
                    break;
                }
                cardList.unshift(laiZiArr[0]);
                laiZiArr.shift();   //癞子删掉一个牌
                substituteCard.unshift(buXiaoValue);
                buXiao++;
            }
            //补完小牌，如果还有癞子，看长度肯定超过了，直接返回错误
            while(laiZiArr.length>0){
                return false;
            }
        }
        if(substituteCard[0]>0){
            //最小的牌是替牌
            if(this.lastCardValue>substituteCard[0]){
                return false;  //上家的牌最小的牌大于我们最小的牌
            }
        }else{
            //最小的牌是普通牌
            if(this.lastCardValue>=this.GetCardValue(cardList[0])){
                return false;  //上家的牌最小的牌大于我们最小的牌
            }
        }
        obRazzCard.cardList=cardList;
        obRazzCard.substituteCard=substituteCard;
        return obRazzCard;
  }
  public CheckLianDui() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length < 4){
            return false; //至少3连队
        }
        if (pokers.length % 2 == 1){
            return false;
        }
        if (this.lastCardList.length > 0 && pokers.length != this.lastCardList.length){
            return false;
        }
        let obRazzCard = {
            "cardType": this.A3PK_CARD_TYPE_LIANDUI,
            "cardList":pokers,
            "substituteCard": [],
        };
        let tempArrB = [];
        let razzCardList = [];//癞子用来代替的牌，如果不是癞子，用0来代替
        let realCardList = [];//按照癞子带牌的顺序，真实的牌
        let arrRazzCard = [];//能组成连队的所有可能
        let laiZiArr = [];
        let lianDuiLength=pokers.length/2;
        this.SortCardByMin(pokers);
        let lastValue = 0;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let nowValue = this.GetCardValue(poker);
            if (nowValue == this.LOGIC_MASK_SHUZI2) {
                //大小王老二不能做连队
                return false;
            }
            let duizi = this.GetSameValue(pokers, poker);
            if (duizi.length > 2){
                return false;  //有3根一样的牌
            }
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if (bInList){
                continue;
            }
            if (duizi.length + laiZiArr.length >= 2 && !bInList) {
                if (lastValue == 0 || (lastValue != 0 && (lastValue + 1) == nowValue)) {
                    tempArrB[tempArrB.length] = duizi;
                    for (let a = 0; a < duizi.length; a++) {
                        realCardList.push(duizi[a]);
                        razzCardList.push(0);
                    }
                    for (let b = 0; b < 2 - duizi.length; b++) {
                        realCardList.push(laiZiArr[0]);
                        razzCardList.push(nowValue);
                        laiZiArr.shift();
                    }
                }
            }
            if (lastValue != 0) {
                if ((lastValue + 1) != nowValue && (nowValue!=this.LOGIC_MASK_XIAOWANG && nowValue!=this.LOGIC_MASK_DAWANG)) {
                    let enoughRazz = false;
                    while (this.GetCardValue(poker) != lastValue + 1) {
                        if (laiZiArr.length >= 2) {
                            nowValue = lastValue + 1;
                            realCardList.push(laiZiArr[0]);
                            laiZiArr.shift();
                            realCardList.push(laiZiArr[0]);
                            laiZiArr.shift();
                            razzCardList.push(nowValue);
                            razzCardList.push(nowValue);
                            lastValue = nowValue;
                            enoughRazz = true;
                        } else {
                            enoughRazz = false;
                            break;
                        }
                    }
                    if (enoughRazz) {
                        nowValue = this.GetCardValue(poker);
                        if (duizi.length + laiZiArr.length >= 2) {
                            tempArrB[tempArrB.length] = duizi;
                            for (let a = 0; a < duizi.length; a++) {
                                realCardList.push(duizi[a]);
                                razzCardList.push(0);
                            }
                            for (let b = 0; b < 2 - duizi.length; b++) {
                                realCardList.push(laiZiArr[0]);
                                razzCardList.push(nowValue);
                                laiZiArr.shift();
                            }
                        } else {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
            } else if (this.lastCardValue && this.lastCardValue != 0 && nowValue <= this.lastCardValue) {
                return false;
            }
            lastValue = nowValue;
        }
        if (laiZiArr.length > 0) {
            //如果鬼牌还剩2张的倍数，则需要特殊判断，前后各加一对组成两种连队
            if (laiZiArr.length % 2 == 0) {
                let fristValue = this.GetCardValue(pokers[0]);
                if (laiZiArr.length / 2 == 1) {
                    //第一种，往上加一个对子组成连队
                    if (lastValue < 14) {
                        let copyRealCardList_1 = this.copyArr(realCardList);
                        let copyRazzCardList_1 = this.copyArr(razzCardList);
                        for (let a = 0; a < laiZiArr.length; a++) {
                            copyRealCardList_1.push(laiZiArr[a]);
                            copyRazzCardList_1.push(lastValue + 1);
                        }
                        let obRazzCard_1 = {
                            "opType": this.A3PK_CARD_TYPE_LIANDUI,
                            "substituteCard": copyRazzCardList_1,
                            "cardList": copyRealCardList_1
                        };
                        return obRazzCard_1;
                    }
                    //第二种，往下加一个对子组成连队
                    if (fristValue - 1 > this.lastCardValue && (fristValue > 3) || fristValue > 2) {
                        let copyRealCardList_2 = this.copyArr(realCardList);
                        let copyRazzCardList_2 = this.copyArr(razzCardList);
                        for (let a = 0; a < laiZiArr.length; a++) {
                            copyRealCardList_2.unshift(laiZiArr[a]);
                            copyRazzCardList_2.unshift(fristValue - 1);
                        }
                        let obRazzCard_2 = {
                            "opType": this.A3PK_CARD_TYPE_LIANDUI,
                            "substituteCard": copyRazzCardList_2,
                            "cardList": copyRealCardList_2
                        };
                        return obRazzCard_2;
                    }
                } else if (laiZiArr.length / 2 == 2) {
                    //第一种，往上加两个对子组成连队
                    if (lastValue < 13) {
                        let copyRealCardList_3 = this.copyArr(realCardList);
                        let copyRazzCardList_3 = this.copyArr(razzCardList);
                        for (let a = 0; a < laiZiArr.length; a++) {
                            copyRealCardList_3.push(laiZiArr[a]);
                            if (a < 2) {
                                copyRazzCardList_3.push(lastValue + 1);
                            } else {
                                copyRazzCardList_3.push(lastValue + 2);
                            }
                        }
                        let obRazzCard_3 = {
                            "opType": this.A3PK_CARD_TYPE_LIANDUI,
                            "substituteCard": copyRazzCardList_3,
                            "cardList": copyRealCardList_3
                        };
                        return obRazzCard_3;
                    }
                    //第二种，往下加两个对子组成连队
                    if (fristValue - 2 > this.lastCardValue && (fristValue > 4) || fristValue > 3) {
                        let copyRealCardList_4 = this.copyArr(realCardList);
                        let copyRazzCardList_4 = this.copyArr(razzCardList);
                        for (let a = 0; a < laiZiArr.length; a++) {
                            copyRealCardList_4.unshift(laiZiArr[a]);
                            if (a < 2) {
                                copyRazzCardList_4.unshift(fristValue - 1);
                            } else {
                                copyRazzCardList_4.unshift(fristValue - 2);
                            }
                        }
                        let obRazzCard_4 = {
                            "opType": this.A3PK_CARD_TYPE_LIANDUI,
                            "substituteCard": copyRazzCardList_4,
                            "cardList": copyRealCardList_4
                        };
                        return obRazzCard_4;
                    }
                    //第三种，前后各加一个对子组成连队
                    if (fristValue - 1 > this.lastCardValue && lastValue < this.LOGIC_MASK_ZIMUA && (fristValue > 3)
                        || fristValue > 2) {
                        let copyRealCardList_5 = this.copyArr(realCardList);
                        let copyRazzCardList_5 = this.copyArr(razzCardList);
                        for (let a = 0; a < laiZiArr.length; a++) {
                            if (a < 2) {
                                copyRealCardList_5.unshift(laiZiArr[a]);
                                copyRazzCardList_5.unshift(fristValue - 1);
                            } else {
                                copyRealCardList_5.push(laiZiArr[a]);
                                copyRazzCardList_5.push(lastValue + 1);
                            }
                        }
                        let obRazzCard_5 = {
                            "opType": this.A3PK_CARD_TYPE_LIANDUI,
                            "substituteCard": copyRazzCardList_5,
                            "cardList": copyRealCardList_5
                        };
                        return obRazzCard_5;
                    }
                }
            } else {
                return false;
            }
        } else {
            if(realCardList.length==0 || realCardList.length/2!=lianDuiLength){
                return false;
            }
            obRazzCard.opType = this.A3PK_CARD_TYPE_LIANDUI;
            obRazzCard.cardList = realCardList;
            obRazzCard.substituteCard = razzCardList;
            return obRazzCard;
        }
  }
   /* SetSameCardSelected: function (cardIdx) {
        let cardType = this.handCardList[cardIdx - 1];
        let sameCard = [];
        let array = [];
        if (this.lastCardType == this.A3PK_CARD_TYPE_SINGLECARD) {
            array = this.GetOneCardByOnclickOneCard();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_DUIZI) {
            array = this.GetDuiziByOnclickOneCard();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_3DAI2) {
            //array = this.GetSanZhangByOnclickOneCard();
            array = this.GetSanZhangByOnclick1Dui();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_SHUNZI) {
            array = this.GetShunZiByOnclickOneCard();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_ZHADAN) {
            array = this.GetZhaDan();
        } else if (this.lastCardType == this.A3PK_CARD_TYPE_LIANDUI) {
            array = this.GetLianDuiByOnclickOneCard();
        }
        for (let i = 0; i < array.length; i++) {
            if (array[i].indexOf(cardType) > -1) {
                sameCard = array[i];
                break;
            }
        }
        if (sameCard.length > 0) {
            this.ChangeSelectCard(sameCard);
        } else {
            sameCard.push(cardType);
            this.ChangeSelectCard(sameCard);
        }
    },*/
  public Get510K(isSelectCard=false) {
        /*let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        let _510k=[];
        let istBig=true;
        //上家出的纯色510k，直接返回false
        if((this.GetCardColor(this.lastCardList[0])==this.GetCardColor(this.lastCardList[1])) && (this.GetCardColor(this.lastCardList[0])==this.GetCardColor(this.lastCardList[2]))){
            istBig=false;
        }
        if(istBig==true){
            //尝试获取纯色510k
            let _50=[];
            let _100=[];
            let _130=[];
            for(let i=0;i<pokers.length;i++){
                if(this.GetCardValue(pokers[i])==5 && this.GetCardColor(pokers[i])==0){
                    _50.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==10 && this.GetCardColor(pokers[i])==0){
                    _100.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==13 && this.GetCardColor(pokers[i])==0){
                    _130.push(pokers[i]);
                }
            }

            let _516=[];
            let _1016=[];
            let _1316=[];
            for(let i=0;i<pokers.length;i++){
                if(this.GetCardValue(pokers[i])==5 && this.GetCardColor(pokers[i])==16){
                    _516.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==10 && this.GetCardColor(pokers[i])==16){
                    _1016.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==13 && this.GetCardColor(pokers[i])==16){
                    _1316.push(pokers[i]);
                }
            }

            let _532=[];
            let _1032=[];
            let _1332=[];
            for(let i=0;i<pokers.length;i++){
                if(this.GetCardValue(pokers[i])==5 && this.GetCardColor(pokers[i])==32){
                    _532.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==10 && this.GetCardColor(pokers[i])==32){
                    _1032.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==13 && this.GetCardColor(pokers[i])==32){
                    _1332.push(pokers[i]);
                }
            }

            let _548=[];
            let _1048=[];
            let _1348=[];
            for(let i=0;i<pokers.length;i++){
                if(this.GetCardValue(pokers[i])==5 && this.GetCardColor(pokers[i])==48){
                    _548.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==10 && this.GetCardColor(pokers[i])==48){
                    _1048.push(pokers[i]);
                }
                if(this.GetCardValue(pokers[i])==13 && this.GetCardColor(pokers[i])==48){
                    _1348.push(pokers[i]);
                }
            }
            if(_50.length>0 && _100.length>0 && _130.length>0){
                _510k.push({"opType":this.A3PK_CARD_TYPE_510K,"cardList":[_50[0],_100[0],_130[0]]});
            }
            if(_516.length>0 && _1016.length>0 && _1316.length>0){
                _510k.push({"opType":this.A3PK_CARD_TYPE_510K,"cardList":[_516[0],_1016[0],_1316[0]]});
            }
            if(_532.length>0 && _1032.length>0 && _1332.length>0){
                _510k.push({"opType":this.A3PK_CARD_TYPE_510K,"cardList":[_532[0],_1032[0],_1332[0]]});
            }
            if(_548.length>0 && _1048.length>0 && _1348.length>0){
                _510k.push({"opType":this.A3PK_CARD_TYPE_510K,"cardList":[_548[0],_1048[0],_1348[0]]});
            }

        }
        this.GetZhaDanEx(_510k,isSelectCard);
        if(_510k.length>0){
            return _510k;
        }
        return [];*/
  }
  public GetLianDui(isSelectCard=false) {
        /*let pokers = [];
        if(isSelectCard==false){
            pokers=this.copyArr(this.handCardList);
        }else{
            pokers=this.copyArr(this.selectCardList);
        }
        if(this.lastCardList.length==0 || this.lastCardList.length%2!=0){
            return [];
        }
        let planeLength=this.lastCardList.length/2;
        //列举出所有的可能连队
        let tempPlane=[];
        for(let i=1;i<11;i++){  //老三到老A，最多11中情况
            if((this.lastCardValue+i)+planeLength<=14){
                tempPlane.push(this.lastCardValue+i);
            }else{
                break;
            }
        }
        //所有的飞机列举出来，在过滤筛选
        let planetDi=[];//获取所有的飞机底牌
        for(let i=0;i<tempPlane.length;i++){
            let diPai=[];
            let val=tempPlane[i];
            let jia=1;
            diPai.push(val);diPai.push(val);
            while(jia<planeLength){
                let jiapai=val+jia;
                diPai.push(jiapai);diPai.push(jiapai);
                jia++;
            }
            planetDi.push(diPai);
        }
        //过滤掉所有的不能用底牌
        let planetDi2=[];
        for(let i=0;i<planetDi.length;i++){
            let laiZiArr = [];
            let checkTemp=[];
            let pokerValues=planetDi[i];

            let isFull=true;

            for(let j=0;j<pokerValues.length;j++){
                let pokerValue=pokerValues[j];
                if(checkTemp.indexOf(pokerValue)==-1){
                    //没检测过
                    if(this.GetValueCount(pokers,pokerValue)==0){
                        //需要补三根
                        if(laiZiArr.length<2){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();laiZiArr.shift();
                    }
                    if(this.GetValueCount(pokers,pokerValue)==1){
                        //需要补三根
                        if(laiZiArr.length<1){
                            isFull=false;
                            break;
                        }
                        laiZiArr.shift();
                    }
                }
                checkTemp.push(pokerValue);
            }
            if(isFull){
                planetDi2.push(planetDi[i]);
            }
        }
        let planetDi3=[];
        //所有够补牌的，再补上对子。如果牌不够补，优先刚好，然后补牌，然后拆炸弹
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取刚好的牌
            let checkTemp=[];
            let planePai=planetDi2[i];
            for(let j=0;j<planePai.length;j++){
                let cardValue=planePai[j];
                if(checkTemp.indexOf(cardValue)==-1){
                    //需要检查的排数
                    if(this.GetValueCount(pokers,cardValue)!=2){
                        break;
                    }
                }
                checkTemp.push(cardValue);
            }
            planetDi3.push(planetDi2[i]);
        }
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取癞子补牌
            let checkTemp=[];
            let planePai=planetDi2[i];
            let deng3Count=0;
            for(let j=0;j<planePai.length;j++){
                let cardValue=planePai[j];
                if(checkTemp.indexOf(cardValue)==-1){
                    //需要检查的排数
                    if(this.GetValueCount(pokers,cardValue)>2){ 
                        break;
                    }
                    if(this.GetValueCount(pokers,cardValue)==2){
                        deng3Count++;
                    }
                }
                checkTemp.push(cardValue);
            }
            if(planeLength>deng3Count){ //过滤掉，都是刚好2根的情况
                planetDi3.push(planetDi2[i]);
            }
        }
        for(let i=0;i<planetDi2.length;i++){
            //这轮循环，获取拆牌，把剩下的情况加到这里即可
            let checkTemp=[];
            let planePai=planetDi2[i];
            if(this.CheckArrayInArray(planetDi3,planePai)==false){
                planetDi3.push(planePai);
            }
        }
        //现在对有的底牌
        let realPlane=[];
        for(let i=0;i<planetDi3.length;i++){
            let pokersCopy=this.copyArr(pokers);
            let cardList=[];
            let substituteCard=[];
            let diPais=planetDi3[i];
            let laiZiArr = [];

            for(let j=0;j<diPais.length;j++){
                let pai=diPais[j];
                let isGet=false;
                let pokersCopyLength=pokersCopy.length;
                for(let k=0;k<pokersCopyLength;k++){
                    if(this.GetCardValue(pokersCopy[k])==pai){
                        cardList.push(pokersCopy[k]);
                        pokersCopy.splice(k,1);
                        substituteCard.push(0);
                        isGet=true;
                        break;
                    }
                }
                if(isGet==false){
                    cardList.push(laiZiArr[0]);
                    substituteCard.push(pai);
                    laiZiArr.shift();
                }
            }
            realPlane.push({"opType":this.A3PK_CARD_TYPE_LIANDUI,"cardList":cardList,"substituteCard":substituteCard,"headList":diPais});
        }
        this.Get510KEx(realPlane,isSelectCard);
        this.GetZhaDanEx(realPlane,isSelectCard);
        if(realPlane.length>0){
            return realPlane;
        }
        return [];*/
  }
  public CheckDuizi() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 2){
            return false;
        }
        let myCardValue = 0;
        let guiWangDui=false;
        let laiZiArr =[];
        
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_DUIZI,
            "cardList":pokers,
            "substituteCard": [],
        };
        let bDui = false;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if (laiZiArr.length == 2) {
                myCardValue = this.GetCardValue(laiZiArr[0]);
                obRazzCard.cardList=[laiZiArr[0],laiZiArr[1]];
                obRazzCard.substituteCard=[0,0];
                bDui = true;
                break;
            }else if (duizi.length == 1 && laiZiArr.length == 1) {
                myCardValue = this.GetCardValue(duizi[0]);
                obRazzCard.cardList=[duizi[0],laiZiArr[0]];
                obRazzCard.substituteCard=[0,myCardValue];
                bDui = true;
                break;
            }else if(duizi.length == 2 && laiZiArr.length == 0){
                myCardValue = this.GetCardValue(duizi[0]);
                bDui = true;
                break;
            }
        }
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length){
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return obRazzCard;
            }else if(myCardValue==this.lastCardValue){
                let myCardColor=this.GetCardColor(obRazzCard.cardList[0]);
                let myCardColor2=this.GetCardColor(obRazzCard.cardList[1]);
                if(myCardColor2>myCardColor){
                    myCardColor=myCardColor2;
                }
                if(myCardColor>this.lastCardColor){
                    return obRazzCard;
                }
            }else{
                return false;
            }
            
        }
        if (bDui) {
            return obRazzCard;
        }
        return false;
  }

  public Check3Zhang() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 3){
            return false;
        }
        let myCardValue = 0;
        let guiWangDui=false;
        let laiZiArr =[];
        
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_3ZHANG,
            "cardList":pokers,
            "substituteCard": [],
        };
        let bDui = false;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if(duizi.length == 3){
                myCardValue = this.GetCardValue(duizi[0]);
                bDui = true;
                break;
            }
        }
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length){
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return obRazzCard;
            }else{
                return false;
            }
            
        }
        if (bDui) {
            return obRazzCard;
        }
        return false;
  }
  public Check4Zhang() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 4){
            return false;
        }
        let myCardValue = 0;
        let guiWangDui=false;
        let laiZiArr =[];
        
        let obRazzCard = {
            "opType": this.A3PK_CARD_TYPE_4ZHANG,
            "cardList":pokers,
            "substituteCard": [],
        };
        let bDui = false;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if(duizi.length == 4){
                myCardValue = this.GetCardValue(duizi[0]);
                bDui = true;
                break;
            }
        }
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length){
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return obRazzCard;
            }else{
                return false;
            }
            
        }
        if (bDui) {
            return obRazzCard;
        }
        return false;
  }

  public Check5Zhang() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 5){
            return false;
        }
        if(this.lastCardType>=2 && this.lastCardType<=5){
            return false; //对子，三张，4张，  5张不能比他们大
        }
        let myCardValue = 0;
        let obRazzCard = {};
        //判断同花
        let isTongHua=this.isTongHua(pokers);
        let isShunZi=this.isShunZi(pokers);
        if(isTongHua && isShunZi>0){
            //同花顺
            if (this.lastCardValue && this.lastCardValue != 0 && this.lastCardType==this.A3PK_CARD_TYPE_TONGHUASHUN) {
                if(isShunZi<this.lastCardValue){
                    return false;
                }
                if(isShunZi==this.lastCardValue && this.GetCardColor(pokers[0])<this.lastCardColor){
                    return false;
                }
            }
            obRazzCard = {
                "opType":this.A3PK_CARD_TYPE_TONGHUASHUN,
                "cardList":pokers,
                "substituteCard": [],
            };
            return obRazzCard;
        }
        //4带1情况
        let is4Dai1=this.is4Dai1(pokers);
        if(is4Dai1>0 && this.lastCardType<=this.A3PK_CARD_TYPE_4DAI1){
            if (this.lastCardValue && this.lastCardValue != 0 && this.lastCardType==this.A3PK_CARD_TYPE_4DAI1) {
                if(is4Dai1<this.lastCardValue){
                    return false;
                }
            }
            obRazzCard = {
                "opType":this.A3PK_CARD_TYPE_4DAI1,
                "cardList":pokers,
                "substituteCard": [],
            };
            return obRazzCard;
        }
        //3带2
        let is3Dai2=this.is3Dai2(pokers);
        if(is3Dai2>0 && this.lastCardType<=this.A3PK_CARD_TYPE_3DAI2){
            if (this.lastCardValue && this.lastCardValue != 0 && this.lastCardType==this.A3PK_CARD_TYPE_3DAI2) {
                if(is3Dai2<this.lastCardValue){
                    return false;
                }
            }
            obRazzCard = {
                "opType":this.A3PK_CARD_TYPE_3DAI2,
                "cardList":pokers,
                "substituteCard": [],
            };
            return obRazzCard;
        }
        //同花
        if(isTongHua && this.lastCardType<this.A3PK_CARD_TYPE_TONGHUA){
            obRazzCard = {
                "opType":this.A3PK_CARD_TYPE_TONGHUA,
                "cardList":pokers,
                "substituteCard": [],
            };
            return obRazzCard;
        }
        //顺子
        if(isShunZi>0 && this.lastCardType<=this.A3PK_CARD_TYPE_SHUNZI){
             if (this.lastCardValue && this.lastCardValue != 0 && this.lastCardType==this.A3PK_CARD_TYPE_SHUNZI) {
                if(isShunZi<this.lastCardValue){
                    return false;
                }
            }
            obRazzCard = {
                "opType":this.A3PK_CARD_TYPE_SHUNZI,
                "cardList":pokers,
                "substituteCard": [],
            };
            return obRazzCard;
        }
  }
  public is4Dai1(pokers) {
        if(pokers.length!=5){
            return 0;
        }
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let zhadan = this.GetSameValue(pokers, poker);
            this.SortCardByMin(zhadan);
            if (zhadan.length >= 4) {
                return this.GetCardValue(zhadan[0]);
            }
        }
        return 0;
  }
  public is3Dai2(pokers) {
        if(pokers.length!=5){
            return 0;
        }
        let sanValue=0;
        let is3=false;
        let is2=false;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let zhadan = this.GetSameValue(pokers, poker);
            this.SortCardByMin(zhadan);
            if (zhadan.length==3 && is3==false) {
                sanValue=this.GetCardValue(zhadan[0]);
                is3=true;
            }
            if (zhadan.length==2 && is2==false) {
                is2=true;
            }
        }
        if(is3==true && is2==true){
            return sanValue;
        }
        return 0;
  }
  public isTongHua(pokers) {
        if(pokers.length!=5){
            return false;
        }
        let color=this.GetCardColor(pokers[0]);
        for(let i=1;i<pokers.length;i++){
            let checkColor=this.GetCardColor(pokers[i]);
            if(color!=checkColor){
                return false;
            }
        }
        return true;
  }
    //A2345<23456<34567,特殊牌型
  public isShunZi(pokers) {
        if(pokers.length!=5){
            return 0;
        }
        let kexuanwanfa = this.A3PKRoom.GetRoomConfigByProperty("kexuanwanfa");
        let pokerValues=this.PokerList2Value(pokers);
        if(kexuanwanfa.indexOf(0)>-1){
            //顺子不带A
            if(pokerValues.indexOf(this.LOGIC_MASK_ZIMUA)>-1){
                return 0;
            }
        }
        //检查特殊牌型
        if(pokerValues.toString()==[4,5,14,15,15.5].toString()){ //A2345
            return 5;
        }
        if(pokerValues.toString()==[4,5,6,15,15.5].toString()){ //23456
            return 6;
        }
        if(pokerValues.toString()==[4,5,6,7,15.5].toString()){ //34567
            return 7;
        }
        //剩下的牌型不能包含2了
        if(pokerValues.indexOf(this.LOGIC_MASK_SHUZI2)>-1){
            return 0;
        }
        if(pokerValues[0]+1==pokerValues[1] && pokerValues[1]+1==pokerValues[2] && pokerValues[2]+1==pokerValues[3] && pokerValues[3]+1==pokerValues[4]){
            return pokerValues[4];
        }
        return 0;
  }
  public PokerList2Value(pokers) {
        let copyPokers=this.copyArr(pokers);
        this.SortCardByMin(copyPokers);
        let values=[];
        for(let i=0;i<copyPokers.length;i++){
            values.push(this.GetCardValue(copyPokers[i]));
        }
        return values;
  }

  public CheckOneCard() {
        let pokers=this.copyArr(this.selectCardList);
        if (pokers.length != 1){
            return false;
        }
        let myCardValue = this.GetCardValue(pokers[0]);
        let myCardColor = this.GetCardColor(pokers[0]);
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length){
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return {"opType":this.A3PK_CARD_TYPE_SINGLECARD,"cardList":pokers,"substituteCard":[0]};
            }else if(myCardValue==this.lastCardValue &&  myCardColor>this.lastCardColor){
                return {"opType":this.A3PK_CARD_TYPE_SINGLECARD,"cardList":pokers,"substituteCard":[0]};
            }
            return false;
        }
        return {"opType":this.A3PK_CARD_TYPE_SINGLECARD,"cardList":pokers,"substituteCard":[0]};
  }
  public is510K(pokers) {
        /*let copyPokers=this.copyArr(pokers);
        this.SortCardByMin(copyPokers);
        if(this.GetCardValue(copyPokers[0])!=5){
            return false;
        }
        if(this.GetCardValue(copyPokers[1])!=10){
            return false;
        }
        if(this.GetCardValue(copyPokers[2])!=13){
            return false;
        }
        return true;*/
  }
  public Check510K() {
       /* let pokers=this.copyArr(this.selectCardList);
        if(pokers.length!=3){
            return false;
        }
        if (this.lastCardType == this.A3PK_CARD_TYPE_ZHADAN) {
            return false;
        }
        this.SortCardByMin(pokers);
        if(this.GetCardValue(pokers[0])!=5){
            return false;
        }
        if(this.GetCardValue(pokers[1])!=10){
            return false;
        }
        if(this.GetCardValue(pokers[2])!=13){
            return false;
        }
        if(this.lastCardType<this.A3PK_CARD_TYPE_510K){
            return {"opType":this.A3PK_CARD_TYPE_510K,"cardList":this.copyArr(pokers),"substituteCard":[]}
        }else{
            //都是510k的情况
            if(this.GetCardColor(pokers[0])!=this.GetCardColor(pokers[1])){
                //不是同色
                return false;
            }
            if(this.GetCardColor(pokers[0])!=this.GetCardColor(pokers[2])){
                //不是同色
                return false;
            }
            if(this.GetCardColor(this.lastCardList[0])!=this.GetCardColor(this.lastCardList[1])){
                 return {"opType":this.A3PK_CARD_TYPE_510K,"cardList":this.copyArr(pokers),"substituteCard":[]}
            }
            if(this.GetCardColor(this.lastCardList[0])!=this.GetCardColor(this.lastCardList[2])){
                 return {"opType":this.A3PK_CARD_TYPE_510K,"cardList":this.copyArr(pokers),"substituteCard":[]}
            }
            return false;//上家也是同色的情况
        }*/
  }

  public CheckZhaDan() {
        /*let pokers=this.copyArr(this.selectCardList);
        let myCardValue = 0;   
        this.SortCardByMin(pokers);
        if (this.IsZhadan(pokers)) {
            if (this.lastCardType < this.A3PK_CARD_TYPE_ZHADAN) {
                //上家出的牌不是炸弹，那炸弹可以直接压
                let cardList=[];
                let substituteCard=[];
                let myCardValue = this.GetCardValue(pokers[0]);
                for (var j = 0; j < pokers.length; j++) {
                    if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_LAIZI) {
                       cardList.push(pokers[j]);
                       substituteCard.push(0);
                    }else{
                       cardList.push(pokers[j]);
                       substituteCard.push(myCardValue);
                    }
                }
                return {"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard}
            }
            //炸弹的点数排除癞子
            for (var j = 0; j < pokers.length; j++) {
                if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_LAIZI) {
                    myCardValue = this.GetCardValue(pokers[j]);
                }
            }
        }else{
            return false;
        }
        // 特殊炸弹：8张炸>4王炸>7张炸，6张炸>3王炸>5张炸
        //先比较牌值再比较张数
        let cardList=[];
        let substituteCard=[];
        if (myCardValue > this.lastCardValue) {
            if (this.ZhaDanLength(pokers) >= this.ZhaDanLength(this.lastCardList)) {
                for (var j = 0; j < pokers.length; j++) {
                    if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_LAIZI) {
                       cardList.push(pokers[j]);
                       substituteCard.push(0);
                    }else{
                       cardList.push(pokers[j]);
                       substituteCard.push(myCardValue);
                    }
                }
                return {"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard}

            }
        } else if (myCardValue <= this.lastCardValue) {
            if (this.ZhaDanLength(pokers) >= this.ZhaDanLength(this.lastCardList)) {
                for (var j = 0; j < pokers.length; j++) {
                    if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_LAIZI) {
                       cardList.push(pokers[j]);
                       substituteCard.push(0);
                    }else{
                       cardList.push(pokers[j]);
                       substituteCard.push(myCardValue);
                    }
                }
                return {"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard}
            }
        }
        return false;*/
  }
  public IsShuZi2Gui(pokers) {
       /* let IsShuZi2Gui = false;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue == this.LOGIC_MASK_SHUZI2 || cardValue == this.LOGIC_MASK_XIAOWANG || cardValue == this.LOGIC_MASK_DAWANG) {
                IsShuZi2Gui = true;
            }
        }
        return IsShuZi2Gui;*/
  }
  public IsZhadan(pokers) {
        /*if(pokers.length<4){
            return false;
        }
        let temp = [];
        let laiZiArr=this.GetLaiZiArr(pokers);

      
        for (let i = 0; i < pokers.length; i++) {
            let poker=pokers[i];
            let zhadan = this.GetSameValueNolaiZiArr(pokers, poker);
            if(this.GuiLai()==true){
                if (zhadan.length + laiZiArr.length >= 4) {
                    temp = zhadan;
                    break;
                }
            }else{
                if (zhadan.length>=4){
                    temp = zhadan;
                    break;
                }
            }
        }
        if (pokers.length) {
            if (pokers.length - (temp.length + laiZiArr.length) == 0) {
                return true;
            }
        }
        return false;*/
  }
    //获取可叫牌
  public GetSame3ColorValue(pokers) {
        /*let same3Card=[];
        let sameValueList=[];
        for(let j=0;j<pokers.length;j++){
            sameValueList[j] = [];
            let tagCard=pokers[j];
            let tagCardValue = this.GetCardValue(tagCard);
            let tagCardColor = this.GetCardColor(tagCard);
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                let pokerValue = this.GetCardValue(poker);
                let pokerColor = this.GetCardColor(poker);
                if (tagCardValue == pokerValue && tagCardColor==pokerColor) {
                    sameValueList[j][sameValueList[j].length] = poker;
                }
            }
            if(sameValueList[j].length==3){
                if(same3Card.indexOf(sameValueList[j])==-1){
                    same3Card.push(sameValueList[j]);
                }
                
            }
        }
        return this.array_unique_fb(same3Card);*/
  }
  public array_unique_fb(arr) {
        var obj={};
        let newArray=[];
        for(var i=0;i<arr.length;i++){
            // 判断当前项是否遍历过，是则删除，否存入obj以作对照
            if(!obj.hasOwnProperty(arr[i])){ 
                obj[arr[i]]=i;
                newArray.push(arr[i]);
            }
            
        }
        return newArray;
  }
    //获取同一牌值,大王小王是可以一起做炸弹的，所有要特殊些函数
  public GetSameValuelaiZiArr(pokers, tagCard) {
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if(tagCardValue>15 && pokerValue>15){
                sameValueList[sameValueList.length] = poker;
                continue;
            }
            if (tagCardValue == pokerValue) {
                //排除癞子
                sameValueList[sameValueList.length] = poker;
                continue;
            }
            
        }
        return sameValueList;
  }
  public GetSameValueNolaiZiArr(pokers, tagCard) {
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if(tagCardValue>15){
                continue;
            }
            if (tagCardValue == pokerValue) {
                //排除癞子
                sameValueList[sameValueList.length] = poker;
            }
            
        }
        return sameValueList;
  }


    //获取同一牌值
  public GetSameValue(pokers, tagCard) {
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if (tagCardValue == pokerValue && pokerValue<16) {
                //排除癞子
                sameValueList[sameValueList.length] = poker;
            }
        }
        return sameValueList;
  }
    //获取同一牌值
  public GetSameValueAndGui(pokers, tagCard) {
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if (tagCardValue == pokerValue) {
                //排除癞子
                sameValueList[sameValueList.length] = poker;
            }
        }
        return sameValueList;
  }
  public GetSameCardNum(pokers) {
        let cardNum = {};
        let sameCardList = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let sameCard = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(sameCardList, poker);
            if (sameCard.length > 0 && !bInList) {
                sameCardList.push(sameCard);
            }
        }
        for (let j = 0; j < sameCardList.length; j++) {
            let sameCard = sameCardList[j];
            let cardValue = this.GetCardValue(sameCard[0]);
            if (cardValue == this.LOGIC_MASK_SHUZI2) {
                cardValue = 2;
            }
            if (!cardNum[cardValue]) {
                cardNum[cardValue] = {};
            }
            cardNum[cardValue]["num"] = sameCard.length;
            cardNum[cardValue]["isShow"] = false;
        }
        return cardNum;
  }
  public CheckPokerInListEx(list, tagCard) {
        if (list.length == 0){
            return false;
        }
        let bInList = false;
        for (let i = 0; i < list.length; i++) {
            let item = [];
            if(list[i]['AllCardList']){
                item = list[i]['AllCardList'];
            }else if(list[i]['cardList']){
                //对面里面的也能检测
                item = list[i]['cardList'];
            }else{
                //数组里面的也能检测
                item = list[i];
            }
            let cardValue = this.GetCardValue(item[0]);
            let tagValue = this.GetCardValue(tagCard);
            if (cardValue == tagValue) {
                bInList = true;
            }
        }
        return bInList;
  }
  public CheckPokerInListlaiZiArrEx(list, tagCard) {
        if (list.length == 0){
            return false;
        }
        let tagValue = this.GetCardValue(tagCard);
        for (let i = 0; i < list.length; i++) {
            let item = [];
            if(list[i]['cardList']){
                //对面里面的也能检测
                item = list[i]['cardList'];
            }else{
                //数组里面的也能检测
                item = list[i];
            }
            for(let j=0;j<item.length;j++){
                let cardValue = this.GetCardValue(item[j]);
                if (cardValue == tagValue) {
                    return true;
                }
            }
        }
        return false;
  }
    //获取牌值，大鬼小鬼可以一起做炸弹出
  public GetCardValuZhaDan(poker) {
        let cardColor = this.GetCardColor(poker);
        if (cardColor == 64) {
            //癞子跟鬼牌需要加上16
            let value=poker & this.LOGIC_MASK_VALUE;
            if(value<19){
                return 18; //做炸弹是，大小鬼固定返回大鬼
            }
            return value;
        }
        return poker & this.LOGIC_MASK_VALUE;
  }
    //获取牌值
  public GetCardValue(poker) {
        let cardColor = this.GetCardColor(poker);
        if (cardColor == 64) {
            //癞子跟鬼牌需要加上16
            let value=poker & this.LOGIC_MASK_VALUE;
            return value+16;
        }
        let realValue=poker & this.LOGIC_MASK_VALUE;
        if(realValue==3){
            realValue=15.5;
        }
        return realValue;
  }

    //获取花色
  public GetCardColor(poker) {
        while (poker >= 256) {
            poker -= 256;
        }
        let color = poker & this.LOGIC_MASK_COLOR;
        return color;
  }
  public CheckSameValue(aCards, bCards) {
        let bRet = false;
        for (let i = 0; i < aCards.length; i++) {
            let poker = aCards[i];
            if (bCards.indexOf(poker) != -1) {
                bRet = true;
                break;
            }
        }

        return bRet;
  }
  public CheckPokerInList(list, tagCard) {
        if (list.length == 0) return false;

        let bInList = false;
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let pos = item.indexOf(tagCard);

            if (pos >= 0) {
                bInList = true;
            }
        }
        return bInList;
  }
  public copyArr(arr) {
        let res = [];
        for (let i = 0; i < arr.length; i++) {
            res.push(arr[i]);
        }
        return res;
  }
  public GetNormalPokers(pokers) {
        let normalPokers = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue == this.LOGIC_MASK_SHUZI2 || cardValue == this.LOGIC_MASK_LAIZI || cardValue == this.LOGIC_MASK_DAWANG || cardValue == this.LOGIC_MASK_XIAOWANG) {
                continue;
            }
            normalPokers.push(poker);
        }
        return normalPokers;
  }
    //如果有超过tag只取tag数量的牌
  public RegularCard(pokers, list, tag) {
        let temp = [];
        for (let i = 0; i < list.length; i++) {
            if (temp.length == tag) break;
            temp.push(list[i]);
        }
        pokers[pokers.length] = temp;
  }
    //如果添加到本数组
  public RegularCardEX(pokers, list, tag) {
        let temp = [];
        for (let i = 0; i < list.length; i++) {
            if (temp.length == tag) break;
            temp.push(list[i]);
        }
        pokers.push.apply(pokers,temp);
  }
    //获取不同牌值
  public GetDifferenceValue(pokers, tagCard) {
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if (tagCardValue != pokerValue && pokerValue!=this.LOGIC_MASK_LAIZI) {
                //非癞子牌
                sameValueList.push(poker);
            }
        }
        return sameValueList
  }
  public GetDifferenceValueList(pokers) {
        let diffValueList = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if (pokerValue>15) {
                continue;  //排除癞子
            }
            if(diffValueList.indexOf(pokerValue)==-1){
                diffValueList.push(pokerValue);
            }
        }
        return diffValueList;
  }
  public SetCardData(opCardType,compValue,cardList, substituteCard = [],keyList=[]) {
        if (opCardType == this.A3PK_CARD_TYPE_BUCHU || !cardList.length) {
            return;
        }
        this.lastCardType = opCardType;
        this.lastCardList = cardList;
        this.substituteCard = substituteCard;
        this.lastKeyList=keyList;
        this.lastCardValue=this.GetCardValue(compValue);
        this.lastCardColor=this.GetCardColor(compValue);
  }
    //增加不可出的牌置灰
  public GetForbiddenTouchByZhaDan() {
        let pokers=this.copyArr(this.handCardList);
        let zhadans = [];
        let laiZiArr = this.GetLaiZiArr(pokers);
        //先取出所有的炸弹
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            if (this.IsBigOrSmallPoker(poker)) {
                continue;
            }
            let zhadan = this.GetSameValuelaiZiArr(pokers, poker);
            let bInList = this.CheckPokerInListlaiZiArrEx(zhadans, poker);
            if (zhadan.length + laiZiArr.length >= 4 && !bInList) {
                let copyZhadan = this.copyArr(zhadan);
                let copyRazz = this.copyArr(laiZiArr);
                let copyRazzLen = copyRazz.length;
                let needBoomlen = this.lastCardList.length || 4;
                if (this.lastCardList.length == (zhadan.length + laiZiArr.length) &&
                    this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                    continue;
                } else if (this.lastCardList.length > (zhadan.length + laiZiArr.length)) {
                    continue;
                }
                if (this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                    needBoomlen = this.lastCardList.length + 1;
                }
                if (copyZhadan.length >= needBoomlen) {
                    zhadans[zhadans.length] = copyZhadan;
                }
                copyRazz = this.copyArr(laiZiArr);
                copyRazzLen = copyRazz.length;
                for (let a = 0; a < copyRazzLen; a++) {
                    copyZhadan.push(copyRazz[0]);
                    copyRazz.splice(0, 1);
                    if (copyZhadan.length >= needBoomlen) {
                        zhadans[zhadans.length] = copyZhadan;
                        copyZhadan = this.copyArr(zhadan);
                    }
                }
            }
        }
        let obRazzCard=[];
        for (let i = 0; i < zhadans.length; i++) {
            let item = zhadans[i];
            //对炸弹进行排序，从最小炸弹开始，王炸是最大的炸弹
            this.SortCardByMin(item);
            let cardList=[];
            let substituteCard=[];
            for(let j=0;j<item.length;j++){
                cardList.push(item[j]);
                if(this.GetCardValue(item[j])==this.LOGIC_MASK_LAIZI){
                    substituteCard.push(this.GetCardValue(item[0]));
                }else{
                    substituteCard.push(0);
                }
            }
            obRazzCard.push({"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard});
        }
        return obRazzCard;
  }
  public SetCardTypeByPos(pos, opType) {
        if (opType == this.A3PK_CARD_TYPE_BUCHU) {
            return;
        }
        this.cardTypeByPos[pos] = opType;
  }

  public GetCardTypeByPos(pos) {
        return this.cardTypeByPos[pos];
  }

  public ClearCardData() {
        this.lastCardType = this.A3PK_CARD_TYPE_NOMARL;
        this.lastCardList = [];
        this.lastCardValue = 0;
  }

  public GetLastCardType() {
        return this.lastCardType;
  }
  public GetLastCardValue() {
        //对子，三连对，顺子，炸弹 === 三带二
        let lastCardValueList = this.lastCardValueList;
        this.lastCardValue = lastCardValueList[0] || 0;
  }
  public GetLastCardValueToPlay() {
        return this.lastCardValue;
  }
  public GetDaiNum() {
        return this.daiNum;
  }
  public GetValueCount(pokers,value) {
        let count=0;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if(pokerValue==value){
                count++;
            }
        }
        return count;
  }
  public GetRealCardValueList() {
        let cardList = this.lastCardList;
        let substituteCard = this.substituteCard;
        this.lastCardValueList = [];
        //[3,3,2,4,4]
        if (cardList.length > 1) {
            for (let a = 0; a < cardList.length; a++) {
                let card = cardList[a];
                let value = this.GetCardValue(card);
                if (substituteCard[a] > 0) {//级牌
                    this.lastCardValueList.push(substituteCard[a]);
                } else {
                    this.lastCardValueList.push(value);
                }
            }
        } else if (cardList.length == 1) {
            let value = this.GetCardValue(cardList[0]);
            this.lastCardValueList.push(value);
        }
  }
  public GetDifferenceValueCount(pokers) {
        let diffValueList = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);
            if (pokerValue==this.LOGIC_MASK_LAIZI) {
                continue;  //排除癞子
            }
            if(diffValueList.indexOf(pokerValue)==-1){
                diffValueList.push(pokerValue);
            }
        }
        return diffValueList.length;
  }
    //从手牌中剔除已经在理牌列表中的牌，不参与提示
  public GetHandCardWithOutLipai() {
        let pokers=this.GetHandCard();
        let lipais = this.A3PKRoomSet.GetLiPais();
        let newPokers = [];
        if (lipais.length > 0) {//lipais:[[1,1,1],[2,2,2]]
            let newLipais = [];
            for (let i = 0; i < lipais.length; i++) {
                for (let j = 0; j < lipais[i].length; j++) {
                    newLipais.push(lipais[i][j]);
                }
            }
            for (let i = 0; i < pokers.length; i++) {//移除手牌中理牌的牌
                if (newLipais.indexOf(pokers[i]) == -1) {
                    newPokers.push(pokers[i]);
                }
            }
        }else{
            return pokers;
        }
        return newPokers;
  }
  public ZhaDanLength(pokers) {
        let isGuiZha=true;
        for(let i=0;i<pokers.length;i++){
            if(this.GetCardValue(pokers[i])<16){
                isGuiZha=false;
                break;
            }
        }
        if(isGuiZha==true){
            return pokers.length+4;
        }
        return pokers.length;
  }

  public GetZhaDan(isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
             pokers=this.copyArr(this.handCardList);
        }else{
             pokers=this.copyArr(this.selectCardList);
        }
        let zhadans = [];
        let laiZiArr = this.GetLaiZiArr(pokers);
        //先取出纯炸弹（不包含鬼牌）
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let zhadan = this.GetSameValuelaiZiArr(pokers, poker);
            this.SortCardByMin(zhadan);
            let bInList = this.CheckPokerInListlaiZiArrEx(zhadans, poker);
            if (zhadan.length >= 4 && !bInList) {
                if (this.ZhaDanLength(this.lastCardList) == this.ZhaDanLength(zhadan)) {//长度相等，牌值也大
                    if (this.GetCardValue(zhadan[0]) > this.lastCardValue) {
                        zhadans[zhadans.length] = zhadan;
                    }
                } else if (this.ZhaDanLength(this.lastCardList) < this.ZhaDanLength(zhadan)) {//长度更长
                    zhadans[zhadans.length] = zhadan;
                }
            }
        }
        if (zhadans.length == 0) {
            //再取加炸弹的牌
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                let zhadan = this.GetSameValueNolaiZiArr(pokers, poker);
                this.SortCardByMin(zhadan);
                let bInList = this.CheckPokerInListlaiZiArrEx(zhadans, poker);
                if(this.GuiLai()==true){
                    if (zhadan.length + laiZiArr.length >= 4 && !bInList) {
                        let copyZhadan = this.copyArr(zhadan);
                        let copyRazz = this.copyArr(laiZiArr);
                        let copyRazzLen = copyRazz.length;
                        let needBoomlen = this.lastCardList.length || 4;
                        if (this.ZhaDanLength(this.lastCardList) == (zhadan.length + laiZiArr.length) &&
                            this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                            continue;
                        } else if (this.ZhaDanLength(this.lastCardList) > (zhadan.length + laiZiArr.length)) {
                            continue;
                        }
                        if (this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                            needBoomlen = this.lastCardList.length + 1;
                        }
                        copyRazz = this.copyArr(laiZiArr);
                        copyRazzLen = copyRazz.length;
                        for (let a = 0; a < copyRazzLen; a++) {
                            copyZhadan.push(copyRazz[0]);
                            copyRazz.splice(0, 1);
                            if (copyZhadan.length >= needBoomlen) {
                                zhadans[zhadans.length] = copyZhadan;
                                copyZhadan = this.copyArr(zhadan);
                            }
                        }
                    }
                }else{
                    if (zhadan.length>=4){
                        if (zhadan.length + laiZiArr.length >= 4 && !bInList) {
                            let copyZhadan = this.copyArr(zhadan);
                            let copyRazz = this.copyArr(laiZiArr);
                            let copyRazzLen = copyRazz.length;
                            let needBoomlen = this.lastCardList.length || 4;
                            if (this.ZhaDanLength(this.lastCardList) == (zhadan.length + laiZiArr.length) &&
                                this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                continue;
                            } else if (this.ZhaDanLength(this.lastCardList) > (zhadan.length + laiZiArr.length)) {
                                continue;
                            }
                            if (this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                needBoomlen = this.lastCardList.length + 1;
                            }
                            copyRazz = this.copyArr(laiZiArr);
                            copyRazzLen = copyRazz.length;
                            for (let a = 0; a < copyRazzLen; a++) {
                                copyZhadan.push(copyRazz[0]);
                                copyRazz.splice(0, 1);
                                if (copyZhadan.length >= needBoomlen) {
                                    zhadans[zhadans.length] = copyZhadan;
                                    copyZhadan = this.copyArr(zhadan);
                                }
                            }
                        }
                    }
                }
            }
        }
        //根据长度排序
        zhadans.sort(function (a, b) {
            if (a.length == b.length) {
                return (a[0] & 0x0F) - (b[0] & 0x0F);
            } else {
                return a.length - b.length;
            }
        });
        let BoneList=[];
        for(let i=0;i<zhadans.length;i++){
            let bome=zhadans[i];
            this.SortCardByMin(bome);
            let cardList=[];
            let substituteCard=[];
            for(let j=0;j<bome.length;j++){
                cardList.push(bome[j]);
                if(this.GetCardValue(bome[j])>15){
                    substituteCard.push(this.GetCardValue(bome[0]));
                }else{
                    substituteCard.push(0);
                }
            }
            BoneList.push({"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard});
        }
        return BoneList;
  }
  public Get510KOnlyWithOutLiPai() {
        let pokers = this.GetHandCardWithOutLipai();
        let _510k=[];
        let _5=[];
        let _10=[];
        let _13=[];
        for(let i=0;i<pokers.length;i++){
            if(this.GetCardValue(pokers[i])==5){
                _5.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==10){
                _10.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==13){
                _13.push(pokers[i]);
            }
        }
        if(_5.length>0 && _10.length>0 && _13.length>0){
            return [_5[0],_10[0],_13[0]];
        }
        return [];
  }
  public Get510KOnly() {
        let pokers=this.copyArr(this.handCardList);
        let _510k=[];
        let _5=[];
        let _10=[];
        let _13=[];
        for(let i=0;i<pokers.length;i++){
            if(this.GetCardValue(pokers[i])==5){
                _5.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==10){
                _10.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==13){
                _13.push(pokers[i]);
            }
        }
        if(_5.length>0 && _10.length>0 && _13.length>0){
            return [_5[0],_10[0],_13[0]];
        }
        return [];
  }
  public Get510KEx(array,isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
             pokers=this.copyArr(this.handCardList);
        }else{
             pokers=this.copyArr(this.selectCardList);
        }
        let _510k=[];
        let _5=[];
        let _10=[];
        let _13=[];
        for(let i=0;i<pokers.length;i++){
            if(this.GetCardValue(pokers[i])==5){
                _5.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==10){
                _10.push(pokers[i]);
            }else if(this.GetCardValue(pokers[i])==13){
                _13.push(pokers[i]);
            }
        }
        //穷尽出510K数组
        if(_5.length>0 && _10.length>0 && _13.length>0){
            for(let i=0;i<_5.length;i++){
                for(let j=0;j<_10.length;j++){
                    for(let k=0;k<_13.length;k++){
                        array.push({"opType":this.A3PK_CARD_TYPE_510K,"cardList":[_5[i],_10[j],_13[k]]});
                    }
                }
            }
        }
  }
  public GetZhaDanEx(array,isSelectCard=false) {
        let pokers = [];
        if(isSelectCard==false){
             pokers=this.copyArr(this.handCardList);
        }else{
             pokers=this.copyArr(this.selectCardList);
        }
        let zhadans = [];
        let laiZiArr = this.GetLaiZiArr(pokers);
        //先取出纯炸弹（不包含鬼牌）
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let zhadan = this.GetSameValuelaiZiArr(pokers, poker);
            let bInList = this.CheckPokerInListlaiZiArrEx(zhadans, poker);
            if (zhadan.length >= 4 && !bInList) {
                if (this.lastCardType < this.A3PK_CARD_TYPE_ZHADAN) {//上家出的牌型比炸弹小
                    zhadans[zhadans.length] = zhadan;
                } else {
                    if (this.ZhaDanLength(this.lastCardList) == this.ZhaDanLength(zhadan)) {//长度相等，牌值也大
                        if (this.GetCardValue(zhadan[0]) > this.lastCardValue) {
                            zhadans[zhadans.length] = zhadan;
                        }
                    } else if (this.ZhaDanLength(this.lastCardList) < this.ZhaDanLength(zhadan)) {//长度更长
                        zhadans[zhadans.length] = zhadan;
                    }
                }
            }
        }
        if (zhadans.length == 0) {
            //再取加炸弹的牌
            for (let i = 0; i < pokers.length; i++) {
                let poker = pokers[i];
                let zhadan = this.GetSameValuelaiZiArr(pokers, poker);
                let bInList = this.CheckPokerInListlaiZiArrEx(zhadans, poker);
                if(this.GuiLai()==true){
                    if (zhadan.length + laiZiArr.length >= 4 && !bInList) {
                        if (this.lastCardType < this.A3PK_CARD_TYPE_ZHADAN) {//上家出的牌型比炸弹小
                            let copyZhadan = this.copyArr(zhadan);
                            let copyRazz = this.copyArr(laiZiArr);
                            copyZhadan.push.apply(copyZhadan, copyRazz);
                            zhadans[zhadans.length] = copyZhadan;
                        } else {
                            let copyZhadan = this.copyArr(zhadan);
                            let copyRazz = this.copyArr(laiZiArr);
                            let copyRazzLen = copyRazz.length;
                            let needBoomlen = this.lastCardList.length || 4;
                            if (this.ZhaDanLength(this.lastCardList) == (zhadan.length + laiZiArr.length) &&
                                this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                continue;
                            } else if (this.ZhaDanLength(this.lastCardList) > (zhadan.length + laiZiArr.length)) {
                                continue;
                            }
                            if (this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                needBoomlen = this.lastCardList.length + 1;
                            }
                            copyRazz = this.copyArr(laiZiArr);


                            copyZhadan.push.apply(copyZhadan, copyRazz);
                            zhadans[zhadans.length] = copyZhadan;

                        }
                    }
                }else{
                    if (zhadan.length>=4){
                        if (zhadan.length + laiZiArr.length >= 4 && !bInList) {
                            if (this.lastCardType < this.A3PK_CARD_TYPE_ZHADAN) {//上家出的牌型比炸弹小
                                let copyZhadan = this.copyArr(zhadan);
                                let copyRazz = this.copyArr(laiZiArr);
                                copyZhadan.push.apply(copyZhadan, copyRazz);
                                zhadans[zhadans.length] = copyZhadan;
                            } else {
                                let copyZhadan = this.copyArr(zhadan);
                                let copyRazz = this.copyArr(laiZiArr);
                                let copyRazzLen = copyRazz.length;
                                let needBoomlen = this.lastCardList.length || 4;
                                if (this.ZhaDanLength(this.lastCardList) == (zhadan.length + laiZiArr.length) &&
                                    this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                    continue;
                                } else if (this.ZhaDanLength(this.lastCardList) > (zhadan.length + laiZiArr.length)) {
                                    continue;
                                }
                                if (this.GetCardValue(zhadan[0]) <= this.lastCardValue) {
                                    needBoomlen = this.lastCardList.length + 1;
                                }
                                copyRazz = this.copyArr(laiZiArr);
                                copyZhadan.push.apply(copyZhadan, copyRazz);
                                zhadans[zhadans.length] = copyZhadan;
                            }
                        }
                    }
                }
            }
        }
        //根据长度排序
        zhadans.sort(function (a, b) {
            if (a.length == b.length) {
                return (a[0] & 0x0F) - (b[0] & 0x0F);
            } else {
                return a.length - b.length;
            }
        });
        for (let i = 0; i < zhadans.length; i++) {
            let item = zhadans[i];
            //对炸弹进行排序，从最小炸弹开始，王炸是最大的炸弹
            this.SortCardByMin(item);
            let cardList=[];
            let substituteCard=[];
            for(let j=0;j<item.length;j++){
                cardList.push(item[j]);
                if(this.GetCardValue(item[j])==this.LOGIC_MASK_LAIZI){
                    substituteCard.push(this.GetCardValue(item[0]));
                }else{
                    substituteCard.push(0);
                }
            }
            array.push({"opType":this.A3PK_CARD_TYPE_ZHADAN,"cardList":cardList,"substituteCard":substituteCard});
        }
  }
  public PushTipCard(pokers, samePoker, len) {
        let temp = [];
        samePoker.reverse();
        for (let i = 0; i < len; i++) {
            temp.push(samePoker[i]);
        }
        pokers.push(temp);
  }
  public CheckLianDuiByLiPai(liPai) {
        let pokers = liPai;
        if (pokers.length < 6) return false;
        if (pokers.length % 2 == 1) return false;
        if (this.lastCardList.length > 0 &&
            pokers.length != this.lastCardList.length) return false;

        let tempArrB = [];

        this.SortCardByMinEx(pokers);
        let lastValue = 0;
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let nowValue = this.GetCardValue(poker);
            if (nowValue == this.LOGIC_MASK_SHUZI2) {
                return false;
            }
            let duizi = this.GetSameValue(pokers, poker);
            if (duizi.length != 2) return false;
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if (bInList) continue;
            if (duizi.length == 2 && !bInList) {
                if (lastValue == 0 || (lastValue != 0 && (lastValue + 1) == nowValue)) {
                    tempArrB[tempArrB.length] = duizi;
                }
            }

            if (lastValue != 0) {
                if ((lastValue + 1) != nowValue)
                    return false
            } else if (this.lastCardValue && this.lastCardValue != 0 && nowValue <= this.lastCardValue) {
                return false;
            }

            lastValue = nowValue;
        }
        return true;
  }
  public CheckZhaDanByLiPai(liPai) {
        let pokers = liPai;
        let myCardValue = 0;
        if (this.IsZhadan(pokers)) {
            if (this.lastCardType < this.A3PK_CARD_TYPE_ZHADAN) {
                return true;
            }
            //如果有鬼牌加入的，炸弹比牌值不能用鬼牌来
            for (var j = 0; j < pokers.length; j++) {
                // if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_XIAOWANG && this.GetCardValue(pokers[j] != this.LOGIC_MASK_DAWANG)) {
                if (this.GetCardValue(pokers[j]) != this.LOGIC_MASK_DAXIAOWANG) {
                    myCardValue = this.GetCardValue(pokers[j]);
                }
            }
        } else {
            return false;
        }
        // 特殊炸弹：8张炸>4王炸>7张炸，6张炸>3王炸>5张炸
        //先比较牌值再比较张数
        if (myCardValue > this.lastCardValue) {
            if (pokers.length >= this.lastCardList.length) {
                return true;
            }
        } else if (myCardValue <= this.lastCardValue) {
            if (pokers.length > this.lastCardList.length) {
                return true;
            }
        }
        return false;
  }
  public CheckSanDaiSiDaiByLiPai(tag, liPai) {
        let pokers = liPai;
        if (this.handCardList.length > 5) {
            if (pokers.length != 5) return false;
        }

        let myCardValue = 0;
        let tempArrB = [];

        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let samePoker = this.GetSameValue(pokers, poker);
            if (tag == this.A3PK_CARD_TYPE_3DAI2) {
                if (samePoker.length >= 3) {
                    this.RegularCard(tempArrB, samePoker, 3);
                    break;
                }
            }
        }

        if (tempArrB.length) {
            for (let i = 0; i < tempArrB[0].length; i++) {
                myCardValue = this.GetCardValue(tempArrB[0][i]);
                // if (myCardValue != this.LOGIC_MASK_XIAOWANG && myCardValue != this.LOGIC_MASK_DAWANG) {
                if (myCardValue != this.LOGIC_MASK_DAXIAOWANG) {
                    break;
                }
            }
        }

        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.handCardList.length > 5) {
                if (this.lastCardList.length != pokers.length) {
                    return false;
                }
            }
            if (myCardValue > this.lastCardValue) {
                return true;
            }
            return false;
        }
        if (tempArrB.length) {
            if (tag == this.A3PK_CARD_TYPE_3DAI2) {
                if (this.handCardList.length > pokers.length) {
                    if (pokers.length == 5) {
                        return true;
                    }
                } else {
                    if (pokers.length < 5) {
                        return true;
                    }
                    return true;
                }
            }
        }
        return false;
  }
  public CheckShunZiByLiPai(liPai) {
        let pokers = liPai;
        if (pokers.length < 5) {
            console.log("检查顺子选择的牌=");
            return false;
        }
        if (this.lastCardValue == 10) {
            return false;
        }
        this.SortCardByMax(this.lastCardList);
        this.SortCardByMax(pokers);
        let lastValue = 0;
        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let nowValue = this.GetCardValue(poker);
            if (lastValue != 0) {
                if (nowValue - lastValue != 1) {
                    return false;
                }
            }
            lastValue = nowValue;
        }
        let myCardValue = this.GetCardValue(pokers[0]);
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length) {
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return true;
            }
            return false;
        }
        return true;
  }
  public CheckDuiziByLiPai(liPai) {
        let pokers = liPai;
        if (pokers.length != 2) return false;
        let myCardValue = 0;
        let bDui = false;

        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if (duizi.length == 2) {
                myCardValue = this.GetCardValue(pokers[0]);
                bDui = true;
                break;
            }
        }

        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length) {
                return false;
            }
            if (myCardValue > this.lastCardValue) {
                return true;
            }
            return false;
        }
        if (bDui) {
            return true;
        }
        return false;
  }
  public CheckOneCardByLiPai(liPai) {
        let pokers = liPai;
        if (pokers.length != 1) return false;
        let myCardValue = this.GetCardValue(pokers[0]);
        if (this.lastCardValue && this.lastCardValue != 0) {
            if (this.lastCardList.length != pokers.length) return false;
            if (myCardValue > this.lastCardValue) {
                return true;
            }
            return false;
        }
        return true;
  }
  public CheckSelected(cardValue) {
        if (-1 == this.selectCardList.indexOf(cardValue)) {
            return false;
        }
        return true;
  }
  public GetOneCardBySlideCards(slideCards) {
        let pokers = slideCards;
        pokers = this.GetHandCardWithOutLipai(pokers);
        let array = [];
        let chai = [];

        for (let i = pokers.length - 1; i >= 0; i--) {
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if (cardValue <= this.lastCardValue) {
                continue;
            }
            let sameValue = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(chai, poker);
            if (sameValue.length == 1) {
                this.PushTipCard(array, sameValue, 1);
            } else if (sameValue.length > 1 && !bInList) {
                this.PushTipCard(chai, sameValue, 1);
            }
        }
        array.push.apply(array, chai);
        this.Get510KEx(array);
        this.GetZhaDanEx(array);
        if (array.length > 0) {
            return array[0];
        }
        return array;
  }
  public DeleteCardSelected(cardIdx) {
        let cardType = this.handCardList[cardIdx - 1];
        let pos = this.selectCardList.indexOf(cardType);
        if (pos != -1) {
            this.selectCardList.splice(pos, 1);
        }
  }
  public IsBigOrSmallPoker(poker) {
        let color = this.GetCardColor(poker);
        // if (color == this.LOGIC_MASK_GUICOLOR) {
        if (this.IsBigPoker(poker) || this.IsSmallPoker(poker)) {
            return true;
        }
        return false;
  }
  public IsBigPoker(poker) {
        if (this.GetCardValue(poker)==this.LOGIC_MASK_DAWANG) {
            return true;
        }
        return false;
  }

  public IsSmallPoker(poker) {
        if (this.GetCardValue(poker)==this.LOGIC_MASK_XIAOWANG) {
            return true;
        }
        return false;
  }
}
