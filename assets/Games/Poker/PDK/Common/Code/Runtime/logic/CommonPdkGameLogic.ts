// @ts-nocheck
// Generated from the Creator 2.4.8 CommonPdk logic by tools/migrate-pdk-logic.mjs.
// Method bodies intentionally remain byte-for-byte equivalent apart from the class wrapper.
export interface CommonPdkRoomPolicy {
    GetRoomPaiXing(name: string): boolean;
    GetRoomConfig?(): { ruleOptions?: Record<string, unknown> };
}

export interface CommonPdkRoomSetSource {
    GetHandCard(): number[];
}

export interface CommonPdkGameLogicOptions {
    room?: CommonPdkRoomPolicy;
    roomSet?: CommonPdkRoomSetSource;
    onEvent?: (event: string) => void;
}

export class CommonPdkGameLogic {
    public handCardList = [];
    public selectCardList = [];
    public lastCardType = 0;
    public lastCardList = [];
    public pokerType = [
        0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0x0C,0x0D,0x0E,
        0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,0x1E,
        0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x2A,0x2B,0x2C,0x2D,0x2E,
        0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x3A,0x3B,0x3C,0x3D,0x3E,
    ];
    public readonly LOGIC_MASK_COLOR = 0xF0;
    public readonly LOGIC_MASK_VALUE = 0x0F;
    public readonly Room: CommonPdkRoomPolicy;
    public readonly RoomSet: CommonPdkRoomSetSource;
    private readonly onEvent: (event: string) => void;

    public constructor(options: CommonPdkGameLogicOptions = {}) {
        this.Room = options.room ?? { GetRoomPaiXing: () => false };
        this.RoomSet = options.roomSet ?? { GetHandCard: () => [] };
        this.onEvent = options.onEvent ?? (() => undefined);
    }

    private GetAuthoritativeRuleOptions(): Record<string, unknown> {
        const options = this.Room.GetRoomConfig?.()?.ruleOptions;
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('CommonPdk 权威 ruleOptions 缺失');
        }
        return options;
    }

    private GetMinimumStraightLength(): number {
        const value = Number(this.GetAuthoritativeRuleOptions().minimumStraightLength);
        if (!Number.isSafeInteger(value) || value < 3) {
            throw new Error('CommonPdk 权威 minimumStraightLength 无效');
        }
        return value;
    }

    private GetMinimumPairRunLength(): number {
        const value = Number(this.GetAuthoritativeRuleOptions().minimumPairRunLength);
        if (!Number.isSafeInteger(value) || value < 2) {
            throw new Error('CommonPdk 权威 minimumPairRunLength 无效');
        }
        return value;
    }

    private GetTripleAttachmentMode(): 'DISABLED' | 'SINGLES' | 'PAIRS' | 'SINGLE_OR_PAIR' | 'EITHER' {
        const value = String(this.GetAuthoritativeRuleOptions().tripleAttachmentMode ?? '');
        if (value !== 'DISABLED' && value !== 'SINGLES' && value !== 'PAIRS'
            && value !== 'SINGLE_OR_PAIR' && value !== 'EITHER') {
            throw new Error('CommonPdk 权威 tripleAttachmentMode 无效');
        }
        return value;
    }

    private HasSpecialTripleBombRank(value: number): boolean {
        const ranks = this.GetAuthoritativeRuleOptions().specialTripleBombRanks;
        return Array.isArray(ranks) && ranks.map(Number).includes(value);
    }

    private AllowsTripleSingles(): boolean {
        const mode = this.GetTripleAttachmentMode();
        return mode === 'SINGLES' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER';
    }

    private AllowsTriplePairs(): boolean {
        const mode = this.GetTripleAttachmentMode();
        return mode === 'PAIRS' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER';
    }

    private AllowsTripleTwoSingles(): boolean {
        return this.GetTripleAttachmentMode() === 'EITHER';
    }

    private ComparesTripleAttachments(): boolean {
        return this.GetAuthoritativeRuleOptions().compareTripleAttachments === true;
    }

    private GetFourAttachmentMode(): 'DISABLED' | 'SINGLES' | 'PAIRS' | 'EITHER' {
        const value = String(this.GetAuthoritativeRuleOptions().fourAttachmentMode ?? '');
        if (value !== 'DISABLED' && value !== 'SINGLES' && value !== 'PAIRS' && value !== 'EITHER') {
            throw new Error('CommonPdk 权威 fourAttachmentMode 无效');
        }
        return value;
    }

    private AllowsFourSingles(): boolean {
        const mode = this.GetFourAttachmentMode();
        return mode === 'SINGLES' || mode === 'EITHER';
    }

    private AllowsFourPairs(): boolean {
        const mode = this.GetFourAttachmentMode();
        return mode === 'PAIRS' || mode === 'EITHER';
    }

    public InitHandCard(){
        this.handCardList = [];
        this.selectCardList = [];
        this.lastCardType = 0;
        this.lastCardList = [];

        let handCard = this.RoomSet.GetHandCard();
        if(!Array.isArray(handCard)){
            throw new Error("PDK 权威手牌必须是数组");
        }
        for(let i = 0; i < handCard.length; i++){
            let card = handCard[i];
            this.handCardList.push(card);
        }

        this.SortCardByMax(this.handCardList);
    }

    //还原客户端转过的牌值
    public TransformValueToS(pokers){
        for(let i = 0; i < pokers.length; i++){
            if(pokers[i] > 500){
                pokers[i] = pokers[i] - 500;
            }
        }
    }

    public SortCardByMax(pokers){
        let self = this;
        pokers.sort(function(a, b){
            return self.CompareCardForDisplay(b, a);
        });
    }

    public SortCardByMinEx(pokers){
        let self = this;
        pokers.sort(function(a, b){
            return self.CompareCardForDisplay(a, b);
        });
    }

    public SortCardByMin(pokers){
        let self = this;
        pokers.sort(function(a, b){
            let aValue = a[0];
            let bValue = b[0];
            return self.CompareCardForDisplay(aValue, bValue);
        });
    }

    public OutPokerCard(privateCard){
        this.selectCardList=[];
        this.handCardList=privateCard;
        this.SortCardByMax(this.handCardList);
        this.onEvent("HandCard");
    }

    public GetHandCard(){
        return this.handCardList;
    }

    public GetSelectCard(){
        return this.selectCardList;
    }

    public ChangeSelectCard(cardList){
        this.selectCardList = [];
        this.selectCardList = cardList;
    }

    public SetCardSelected(cardIdx){
        let cardType = this.handCardList[cardIdx -1];
        this.selectCardList.push(cardType);
        console.log("selectCardList == "+this.selectCardList);
    }

    public DeleteCardSelected(cardIdx){
        let cardType = this.handCardList[cardIdx -1];
        let pos = this.selectCardList.indexOf(cardType)
        if (pos != -1){
            this.selectCardList.splice(pos, 1);
        }
        console.log("selectCardList111 == "+this.selectCardList);
    }

    SetCardData(opCardType, cardList){
        if(opCardType == 1){
            return;
        }
        if(!Array.isArray(cardList)){
            throw new Error("PDK 出牌协议缺少牌列表");
        }
        if(!cardList.length) return;

        // comparisonState is an atomic authority snapshot. Never combine its
        // cards with a type retained from an older play.
        this.lastCardType = Number(opCardType);
        this.lastCardList = cardList.map(Number);
    }

    public ClearCardData(){
        this.lastCardType = 0;
        this.lastCardList = [];
    }

    public GetLastCardType(){
        return this.lastCardType;
    }
    public CheckHaveBoomDai(list){
        if(this.HasSpecialTripleBombRank(14)){
            for(let i = 0; i < list.length; i++){
                let item = list[i];
                let sameCard = this.GetSameValue(item, item[0]);
                if(sameCard.length == 3 && this.GetCardValue(sameCard[0]) == 14){
                    return true;
                }
            }
           return false
        }

        return false
        // if(this.Room.GetRoomPaiXing('SiDaiYi')==true){
        //     for(let i = 0; i < list.length; i++){
        //         let item = list[i];
        //         let sameCard = this.GetSameValue(item, item[0]);
        //         if(sameCard.length ==4){
        //             return true;
        //         }
        //         if(this.Room.GetRoomPaiXing('SanAZha')){
        //             if(sameCard.length == 3 && this.GetCardValue(sameCard[0]) == 14){
        //                 return true;
        //             }
        //         }
        //     }
        //     return false;
        // }
        // return false;
    }
    //检查组合是否只有炸弹
    public CheckOnlyBoom(list){
        for(let i = 0; i < list.length; i++){
            let item = list[i];
            let sameCard = this.GetSameValue(item, item[0]);
            if(sameCard.length != item.length)
                return false;
        }
        return true;
    }

    public CheckOneCard(isSelectCard=true){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        if(pokers.length != 1) return false;
        let lastCardValue = 0;
        let myCardValue = 0;

        lastCardValue = this.GetCardValue(this.lastCardList[0]);
        myCardValue = this.GetCardValue(pokers[0]);

        if(lastCardValue && lastCardValue != 0){
            if(this.lastCardList.length != pokers.length) return false;
            if(myCardValue > lastCardValue){
                return true;
            }
            return false;
        }

        return true;
    }

    public CheckDuizi(isSelectCard=true){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        if(pokers.length != 2) return false;

        let lastCardValue = 0;
        let myCardValue = 0;
        let bDui = false;

        lastCardValue = this.GetCardValue(this.lastCardList[0]);
        
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            if(duizi.length == 2){
                myCardValue = this.GetCardValue(poker);
                bDui = true;
                break;
            }
        }

        if(lastCardValue && lastCardValue != 0){
            if(this.lastCardList.length != pokers.length) return false;
            
            if(myCardValue > lastCardValue){
                return true;
            }
            return false;
        }

        if(bDui)
            return true;
        return false;
    }

    IsContinuous(isSelectCard=true){
        // write code here
        if(isSelectCard==false){
            pokers = this.handCardList;
       }else{
            pokers = this.selectCardList;
       }
       if(pokers.length < this.GetMinimumStraightLength()) return false;
        if(pokers.length == 0) return false
        pokers.sort()
            let zero = 0
        for(let i=0;i<pokers.length;i++){
            if(pokers[i] != 0) break;
            zero ++ ;
        }
        let count =zero
        for(let i=pokers.length-1;i>zero;i--){
            let  tmp = pokers[i]-pokers[i-1]
            if(tmp == 0) return false
            else if(tmp == 1 ) continue;
            else { //tmp > 1
                if( count == 0 || count<tmp-1){
                    return false
                 }
                count = count - tmp + 1
            }
        }
        return true;
    }

    public CheckShunzi(isSelectCard=true){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        if(pokers.length < this.GetMinimumStraightLength()) return false;

        let lastCardValue = 0;
        let myCardValue = 0;

        this.SortCardByMax(this.lastCardList);
        this.SortCardByMax(pokers);

        let lastValue = 0;
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let nowValue = this.GetCardValue(poker);
            if(nowValue == 15){
                return false;
            }

            if(lastValue != 0){
                if(lastValue - nowValue != 1)
                    return false;
            }
            
            lastValue = nowValue;
        }

        lastCardValue = this.GetCardValue(this.lastCardList[0]);
        myCardValue = this.GetCardValue(pokers[0]);

        if(lastCardValue && lastCardValue != 0){
            if(this.lastCardList.length != pokers.length) return false;
            
            if(myCardValue > lastCardValue){
                return true;
            }
            return false;
        }

        return true;
    }

    //如果最后首发只有三带 可以不带牌出
    public CheckLastThree(tag, lastCard){
        // 牌型值仅参与规则判定；不要把合法枚举当成控制台错误输出。
        if(this.lastCardType == 0){
            if(this.selectCardList.length != lastCard ||
                this.handCardList.length != lastCard) return false;
            
            let isCheck = false;
            for(let i = 0; i < this.selectCardList.length; i++){
                let poker = this.selectCardList[i];
                let samePoker = this.GetSameValue(this.selectCardList, poker);
                if(samePoker.length >= tag){
                    isCheck = true;
                    break;
                }
            }
            if(isCheck && this.selectCardList.length == lastCard && this.handCardList.length == lastCard){
                return true;
            }
        }
        return false;
    }

    public CheckSanDaiDui(tag, lastCard){
        if(this.lastCardType == 0){
            if(this.selectCardList.length != lastCard ||
                this.handCardList.length != lastCard) return false;
            
            let isCheck = false;
            for(let i = 0; i < this.selectCardList.length; i++){
                let poker = this.selectCardList[i];
                let samePoker = this.GetSameValue(this.selectCardList, poker);
                if(samePoker.length >= tag){
                    isCheck = true;
                    break;
                }
            }
            //补充一个对检测
            let isDui=false;
            for(let i = 0; i < this.selectCardList.length; i++){
                let poker = this.selectCardList[i];
                let samePoker = this.GetSameValue(this.selectCardList,poker);
                if(samePoker.length==2){
                    //有一对
                    isDui = true;
                    break;
                }
            }
            if(isCheck && isDui && this.selectCardList.length == lastCard && this.handCardList.length == lastCard){
                return true;
            }
        }
        return false;
    }

    public CheckSiDaiDui(tag, lastCard){
        if(this.lastCardType == 0){
            if(this.selectCardList.length != lastCard ||
                this.handCardList.length != lastCard) return false;
            
            let isCheck = false;
            for(let i = 0; i < this.selectCardList.length; i++){
                let poker = this.selectCardList[i];
                let samePoker = this.GetSameValue(this.selectCardList, poker);
                if(samePoker.length >= tag){
                    isCheck = true;
                    break;
                }
            }
            //补充一个对检测
            let isDui=false;
            for(let i = 0; i < this.selectCardList.length; i++){
                let poker = this.selectCardList[i];
                let samePoker = this.GetSameValue(this.selectCardList,poker);
                if(samePoker.length==2){
                    //有一对
                    isDui = true;
                    break;
                }
            }
            if(isCheck && isDui && this.selectCardList.length == lastCard && this.handCardList.length == lastCard){
                return true;
            }
        }
        return false;
    }


    public CheckSanDaiSiDai(tag,isSelectCard=true){ 
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        if(tag == 5){
            if(!this.CheckLastThree(3, 3) && this.lastCardType == 0)
            {
                //if(isSelectCard) return false;
                //没有三不带的玩法 不检测
                if(!this.Room.GetRoomPaiXing('QuanSanBuDai')) return false;
            }
        }
        else if(tag == 6){
            //三带一不能出4根一样的begin
            let isCheck=false;
            for(let i = 0; i < pokers.length; i++){
                let poker = pokers[i];
                let samePoker = this.GetSameValue(pokers, poker);
                if(samePoker.length == 3){
                    isCheck = true;
                    break;
                }
            }
            if(isCheck==false){
                return false;
            }
            //三带一不能出4根一样的end
            if(!this.AllowsTripleSingles()){
                return false;
            }
        }
        else if(tag == 7){
            //没有三带二的玩法 不检测
            if(!this.AllowsTripleTwoSingles())
            {
                return false;
            }
        }
        else if(tag == 15){
            //没有三带一对的玩法 不检测
            if(!this.AllowsTriplePairs()){
                return false;
            }
        }
        else if(tag == 8){
            if(this.GetAuthoritativeRuleOptions().allowFourBombWithOne !== true) return false;
        }
        else if(tag == 9){
            if(!this.AllowsFourSingles()) return false;
        }
        else if(tag == 20){
            if(!this.AllowsFourPairs()) return false;
        }
        else if(tag == 10){
            if(this.GetAuthoritativeRuleOptions().allowFourWithThree !== true) return false;
        }
        
        
        let handPokers = this.handCardList;
        if(pokers.length < 3) return false;
        
        let lastCardValue = 0;
        let myCardValue = 0;
        const tripleFamily = (tag >= 5 && tag <= 7) || tag == 15;
        const bodySize = tripleFamily ? 3 : 4;
        const findBody = (cards) => {
            for(let i = 0; i < cards.length; i++){
                const samePoker = this.GetSameValue(cards, cards[i]);
                if(samePoker.length >= bodySize) return samePoker.slice(0, bodySize);
            }
            return [];
        };
        const targetBody = findBody(this.lastCardList);
        const candidateBody = findBody(pokers);
        if(targetBody.length) lastCardValue = this.GetCardValue(targetBody[0]);
        if(candidateBody.length) myCardValue = this.GetCardValue(candidateBody[0]);
        if(lastCardValue && lastCardValue != 0){
            if(this.lastCardList.length != pokers.length && handPokers.length > pokers.length){
                return false;
            }
            if(myCardValue <= lastCardValue){
                return false;
            }
            // In attachment-comparison rooms a triple response must beat both
            // parts of the previous play.  Authority applies this after the
            // triple body comparison; mirroring it here prevents Hint from
            // presenting a locally accepted play that Authority will reject.
            if(tripleFamily && tag !== 5 && this.ComparesTripleAttachments()){
                const maximumAttachmentRank = (cards: number[], body: number[]) => {
                    if(!body.length) return -1;
                    const bodyRank = this.GetCardValue(body[0]);
                    let maximum = -1;
                    for(const card of cards){
                        const rank = this.GetCardValue(card);
                        if(rank !== bodyRank) maximum = Math.max(maximum, rank);
                    }
                    return maximum;
                };
                if(maximumAttachmentRank(pokers, candidateBody)
                    <= maximumAttachmentRank(this.lastCardList, targetBody)){
                    return false;
                }
            }
        }
        if(candidateBody.length){
            if(tag == 5){
                if(pokers.length == 3){
                    return true;
                }
            }
            else if(tag == 6){
                if(pokers.length == 4  || (pokers.length==3 && this.handCardList.length==3 && this.Room.GetRoomPaiXing('SanBuDai'))){
                    return true;
                }
            }
            else if(tag == 7){
                if(pokers.length == 5 || (this.handCardList.length==3 && pokers.length==3 && this.Room.GetRoomPaiXing('SanBuDai')) || (pokers.length==4 && this.handCardList.length==4 && this.Room.GetRoomPaiXing('SanBuDai'))){
                    return true;
                }
            }
            else if(tag == 15){ //三带一对
                let isDui=false;
                for(let i = 0; i < pokers.length; i++){
                    let poker = pokers[i];
                    let samePoker = this.GetSameValue(pokers,poker);
                    if(samePoker.length==2){
                        //有一对
                        isDui = true;
                        break;
                    }
                }
                if((pokers.length == 5 && isDui==true) || (this.Room.GetRoomPaiXing('SanBuDai') && this.handCardList.length==pokers.length && pokers.length<5 && pokers.length>=3)){
                    //最后一手。三不带或者三带一都能出
                    return true;
                }
            }
            else if(tag == 20){ //四带两对
                let isDui = false;
                let pairRanks = [];
                for(let i = 0; i < pokers.length; i++){
                    let poker = pokers[i];
                    let samePoker = this.GetSameValue(pokers,poker);
                    if(samePoker.length==2){
                        let value = this.GetCardValue(poker);
                        if(pairRanks.indexOf(value) == -1) pairRanks.push(value);
                    }
                }
                isDui = pairRanks.length == 2;
                if((pokers.length == 8 && isDui==true) || ( this.handCardList.length==pokers.length && pokers.length<8 && pokers.length>=4)){
                    //最后一手。三不带或者三带一都能出
                    return true;
                }
            }
            else if(tag == 8){
                if(pokers.length == 5){
                    return true;
                }
            }
            else if(tag == 9){
                if(pokers.length == 6){
                    return true;
                }
            }
            else if(tag == 10){
                if(pokers.length == 7){
                    return true;
                }
            }
        }
        return false;
    }

    private GetBombDescriptor(pokers): { tier: number; rank: number } | null {
        if(!Array.isArray(pokers) || !pokers.length) return null;
        const options = this.GetAuthoritativeRuleOptions();
        const counts = new Map<number, number>();
        for(const poker of pokers){
            const rank = this.GetCardValue(poker);
            counts.set(rank, (counts.get(rank) ?? 0) + 1);
        }
        const specialRanks = Array.isArray(options.specialTripleBombRanks)
            ? options.specialTripleBombRanks.map(Number)
            : [];
        const specialRank = [...counts.entries()].find(([rank, count]) => count === 3 && specialRanks.includes(rank))?.[0];
        if(specialRank !== undefined){
            if(pokers.length === 3
                || (pokers.length === 4 && options.allowSpecialTripleBombWithOne === true)){
                return { tier: Number(options.specialBombTier ?? 2), rank: specialRank };
            }
        }
        const ranks = [...counts.keys()].sort((a, b) => a - b);
        if(options.allowConsecutiveBomb === true && pokers.length >= 8 && pokers.length % 4 === 0
            && [...counts.values()].every((count) => count === 4)
            && ranks.every((rank, index) => rank < 15 && (index === 0 || rank === ranks[index - 1] + 1))){
            return { tier: ranks.length * 2 - 1, rank: ranks[ranks.length - 1] };
        }
        const fourRank = [...counts.entries()].find(([, count]) => count === 4)?.[0];
        if(fourRank !== undefined){
            if(pokers.length === 4){
                return { tier: Number(options.standardBombTier ?? 1), rank: fourRank };
            }
            if(pokers.length === 5 && options.allowFourBombWithOne === true){
                return { tier: Number(options.fourBombWithOneTier ?? 1), rank: fourRank };
            }
        }
        return null;
    }

    public IsZhadan(pokers){
        return this.GetBombDescriptor(pokers) !== null;
    }
    
    public CheckZhaDan(){
        let pokers = this.selectCardList;
        const candidate = this.GetBombDescriptor(pokers);
        if(!candidate) return false;
        const previous = this.GetBombDescriptor(this.lastCardList);
        if(!previous) return true;
        return candidate.tier > previous.tier
            || (candidate.tier === previous.tier && candidate.rank > previous.rank);
    }

    public IsLianShun(pokers){
        if(pokers.length < 2) return false;
        
        this.SortCardByMin(pokers);

        let lastValue = 0;
        for(let i = 0; i < pokers.length; i++){
            let item = pokers[i];
            let nowValue = this.GetCardValue(item[0]);

            if(nowValue == 15){
                return false;
            }

            if(lastValue != 0){
                if((lastValue+1) != nowValue)
                    return false;
            }
            
            lastValue = nowValue;
        }

        return true;
    }

    //如果有超过tag只取tag数量的牌
    public RegularCard(pokers, list, tag){
        let temp = [];
        for(let i = 0; i < list.length; i++){
            if(temp.length == tag) break;
            temp.push(list[i]);
        }
        //过滤掉可能相同的元素
        let haveSameArray=false;
        for(let i=0;i<pokers.length;i++){
            if(pokers[i].toString()==temp.toString()){
                haveSameArray=true;
                break;
            }
        }
        if(haveSameArray==false){
            pokers[pokers.length] = temp;
        }
    }

    public GetDaiNum(){
        return this.daiNum;
    }
    
    public CheckSanDaiFeiJi(optype,isSelectCard=true){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        let tag=3;
        let handPokers = this.handCardList;
        
        if(pokers.length < 6) return false;

        let lastCardValue = 0;
        let myCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let santiao = this.GetSameValue(this.lastCardList, poker);
            let bInList = this.CheckPokerInListEx(tempArrA, poker);
            if(santiao.length >= tag && !bInList){
                this.RegularCard(tempArrA, santiao, tag);
            }
        }

        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(tempArrB, poker);
            if(santiao.length >= tag && !bInList){
                this.RegularCard(tempArrB, santiao, tag);
            }
        }

        if(tempArrA.length){
            let realPlaneA = this.GetRealPlane(tempArrA)
            lastCardValue = this.GetCardValue(realPlaneA[0][0]);
        }
        
        if(tempArrB.length < 2){
            return false;
        }
        this.SortCardByMin(tempArrB);
        let realPlane = this.GetRealPlane(tempArrB);
        if(!realPlane.length){
            return false;
        }
        myCardValue = this.GetCardValue(realPlane[0][0]);
        let value = (pokers.length - realPlane.length * tag);
        this.daiNum = value;
        if(tag == 3){
            if(this.Room.GetRoomPaiXing('SanBuDai') && optype==19 && handPokers.length==pokers.length){
                if(value == 0){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
            if(this.AllowsTripleSingles() && optype==16){
                if(value == realPlane.length){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
                else if (handPokers.length <= (realPlane.length * tag + realPlane.length)
                    && handPokers.length == pokers.length && this.Room.GetRoomPaiXing('SanBuDai')) {
                    //如果手牌少于需要带的牌数并且轮到本家出牌则返回true
                    return true;
                }
            }
            if(this.AllowsTriplePairs() && optype==17){
                if(realPlane.length==3 && value==0 && handPokers.length == pokers.length && this.Room.GetRoomPaiXing('SanBuDai')){
                    //最后一手牌，333,444,555  ，算 444，555，三带飞机
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
                //检测剩余的牌是否都成对，否则返回false，开始
                let tempDui=[];
                let duizi=0;
                for(let i=0; i < pokers.length; i++){
                    let poker = pokers[i];
                    let ertiao = this.GetSameValue(pokers, poker);
                    //当三带队飞机时  判定带牌是否有炸   有的话把飞机拆了--zzx
                    if(ertiao.length == 4){
                        for(let key in realPlane){
                            if(this.GetCardValue(realPlane[key][0]) == this.GetCardValue(ertiao[0])){
                                let deleList = realPlane.splice(key,1);
                                value = value + deleList[0].length;
                                continue;
                            }
                        }
                    }
                    let bInList = this.CheckPokerInListEx(tempDui, poker);
                    let bInList2 = this.CheckPokerInListEx(realPlane, poker);
                    if(ertiao.length == 4 && !bInList && !bInList2){
                        duizi=duizi+2;//一个炸弹算两个对
                        this.RegularCard(tempDui,ertiao,2);
                    }else if(ertiao.length >= 2 && !bInList && !bInList2){
                        duizi++;
                        this.RegularCard(tempDui, ertiao,2);
                    } 
                }
                let realDuizi=duizi;
                if(realDuizi<realPlane.length && !this.Room.GetRoomPaiXing('SanBuDai')){
                    return false;   //对子的长度不等于飞机的长度，则返回false
                }
                if(realDuizi<realPlane.length && handPokers.length != pokers.length){
                    return false; //不是最后一手牌
                }
                if(realDuizi<realPlane.length){
                    let danpai=value-realDuizi*2;
                    if(danpai>(realPlane.length-realDuizi)){
                        return false;//最后一手了，但是带的单排太多了
                    }
                }

                //检测剩余的牌是否都成对，否则返回false，结束
                

                if(value == realPlane.length * 2){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
                else if (handPokers.length <= (realPlane.length * tag + realPlane.length * 2)
                    && handPokers.length == pokers.length) {
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
            if(this.AllowsTripleSingles() && optype==18){
                if(realPlane.length==3 && value==1){
                    //三飞机带单根,可以组成  444,555 带 333,6
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
                else if(value == realPlane.length * 2){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
                else if (handPokers.length <= (realPlane.length * tag + realPlane.length * 2)
                    && handPokers.length == pokers.length && this.Room.GetRoomPaiXing('SanBuDai')) {
                    //如果手牌少于需要带的牌数并且轮到本家出牌则返回true
                    return true;
                }
            }
        }
        return false;
    }


    public CheckFeiJi(tag){
        let handPokers = this.handCardList;
        let pokers = this.selectCardList;
        if(pokers.length < 6) return false;

        let lastCardValue = 0;
        let myCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let santiao = this.GetSameValue(this.lastCardList, poker);
            let bInList = this.CheckPokerInListEx(tempArrA, poker);
            if(santiao.length >= tag && !bInList){
                this.RegularCard(tempArrA, santiao, tag);
            }
        }

        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(tempArrB, poker);
            if(santiao.length >= tag && !bInList){
                this.RegularCard(tempArrB, santiao, tag);
            }
        }

        if(tempArrA.length){
            let realPlaneA = this.GetRealPlane(tempArrA)
            lastCardValue = this.GetCardValue(realPlaneA[0][0]);
        }
        
        if(tempArrB.length < 2) return false;
        
        this.SortCardByMin(tempArrB);

        let realPlane = this.GetRealPlane(tempArrB);

        if(!realPlane.length) return false;

        myCardValue = this.GetCardValue(realPlane[0][0]);
        
        let value = (pokers.length - realPlane.length * tag);
        this.daiNum = value;
        if(tag == 3){
            if(this.Room.GetRoomPaiXing('SanBuDai')){
                if(value == 0){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
            if(this.AllowsTripleSingles()){
                if(value == realPlane.length || (realPlane.length>value &&  pokers.length==handPokers.length && this.Room.GetRoomWanfa('SanBuDai'))){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
            if(this.AllowsTriplePairs()){
                //检测剩余的牌是否都成对，否则返回false，开始
                let tempDui = [];
                for(let i=0; i < pokers.length; i++){
                    let poker = pokers[i];
                    let ertiao = this.GetSameValue(pokers, poker);
                    let bInList = this.CheckPokerInListEx(tempDui, poker);
                    if(ertiao.length == 2 && !bInList){
                        this.RegularCard(tempDui, ertiao,2);
                    }
                }
                if(tempDui.length>realPlane.length){
                    return false;
                }
                if(tempDui.length!=realPlane.length && !this.Room.GetRoomWanfa('SanBuDai')){
                    return false;   //对子的长度不等于飞机的长度，则返回false
                }
                
                if(value == realPlane.length * 2){
                    //正常情况的飞机
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }else if(value <realPlane.length*2 && this.Room.GetRoomWanfa('SanBuDai') && handPokers.length==pokers.length){
                    //最后一手牌飞机
                    if(tempDui.length==0 && value>realPlane.length){
                        //没有对子，带的单排比飞机长
                        return false;
                    }else if((value-tempDui.length*2)>realPlane.length-tempDui.length){
                        //有对子，扣掉对子，带的单排比剩余的飞机长
                        return  false;
                    }
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
            if(this.AllowsTripleSingles()){
                if(value == realPlane.length * 2){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }else if(value <realPlane.length*2 && this.Room.GetRoomWanfa('SanBuDai') && handPokers.length==pokers.length){
                    if(lastCardValue && lastCardValue != 0){
                        if(myCardValue > lastCardValue){
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            }
        }
        return false;
    }

    public CheckLianDui(isSelectCard=true){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        const minimumPairRunLength = this.GetMinimumPairRunLength();
        if(pokers.length < minimumPairRunLength * 2){return false;}
        if(pokers.length%2 == 1){return false;}

        let lastCardValue = 0;
        let myCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let duizi = this.GetSameValue(this.lastCardList, poker);
            let bInList = this.CheckPokerInList(tempArrA, poker);
            if(duizi.length == 2 && !bInList){
                tempArrA[tempArrA.length] = duizi;
            }
        }

        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if(duizi.length == 2 && !bInList){
                tempArrB[tempArrB.length] = duizi;
            }
        }

        if(tempArrB.length * 2 != pokers.length){ 
            return false;
        }

        if(this.IsLianShun(tempArrA)){
            lastCardValue = this.GetCardValue(tempArrA[0][0]);
        }

        if(this.IsLianShun(tempArrB)){
            myCardValue = this.GetCardValue(tempArrB[0][0]);
        }
        else{
            return false;
        }
        
        if(lastCardValue && lastCardValue != 0){
            if((pokers.length - this.lastCardList.length) == 0){
                if(myCardValue > lastCardValue){
                    return true;
                }
            }
            return false;
        }
        return true;
    }
    public CheckDragon(){
        let pokers = this.lastCardList;
        if(pokers.length != 12) return false;

        this.SortCardByMinEx(pokers);

        let lastValue = 0;
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let nowValue = this.GetCardValue(poker);
            if(nowValue == lastValue) return false;

            if(nowValue == 15) return false;

            if(lastValue != 0){
                if(nowValue - lastValue != 1)
                    return false;
            }

            lastValue = nowValue;
        }

        return true; 
    }

    public IsDismantleBoom(){
        let pokers = this.handCardList;
        if(this.CheckZhaDan()){
            return false;
        }
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            if(this.selectCardList.indexOf(poker) != -1){
                let zhadan = this.GetSameValue(pokers, poker);
                if(zhadan.length == 4){
                    return true;
                }
                if(this.HasSpecialTripleBombRank(14)){
                    if(zhadan.length == 3 && this.GetCardValue(zhadan[0]) == 14){
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    public GetCardType(isSelectCard=true){
        //
        //0:可以随便出牌 
        //1:不出 
        //2:单牌 
        //3:对子 
        //4:顺子 
        //5:3不带 
        //6:3带1 
        //7:3带2 
        //8:4带1 
        //9:4带2 
        //10:4带3 
        //11:炸弹 
        //12:三带飞机 
        //13:四带飞机 
        //14:连对
        //15:3带1对
        //16:三带一飞机
        //17:三带一对飞机
        //18:三带二飞机
        //19:三不带飞机
        this.daiNum = 0;
        if(isSelectCard==true){
            if(!this.selectCardList.length){
                return 0;
            }
        }
        
        let bCheck = false;
        if(this.CheckZhaDan(isSelectCard)){
            return 11;
        }
        // if(this.CheckSanDaiSiDai(10,isSelectCard)){
        //     return 10; //4带3
        // }
        // if(this.CheckSanDaiSiDai(9,isSelectCard)){
        //     return 9;  //4带2 
        // }
        // if(this.CheckSanDaiSiDai(20,isSelectCard)){
        //     return 20;
        // }
        if(this.lastCardType == 0){
            if(this.CheckOneCard(isSelectCard)){
                return 2;  //单牌
            }
            else if(this.CheckDuizi(isSelectCard)){
                return 3;  //一对
            }
            else if(this.CheckShunzi(isSelectCard)){
                return 4;  //顺子
            }
            else if(this.CheckSanDaiSiDai(10,isSelectCard)){
                return 10; //4带3
            }
            else if(this.CheckSanDaiSiDai(8,isSelectCard)){
                return 8; //4带1
            }
            else if(this.CheckSanDaiSiDai(20,isSelectCard)){
                return 20;  //4带1对 
            }
            else if(this.CheckSanDaiSiDai(9,isSelectCard)){
                return 9;  //4带2 
            }
            else if(this.CheckSanDaiSiDai(5,isSelectCard)){
                return 5;  //3不带
            }
            else if(this.CheckSanDaiSiDai(6,isSelectCard)){
                return 6;  //3带1
            }
            else if(this.CheckSanDaiSiDai(15,isSelectCard)){
                return 15; //3带一对
            }
            else if(this.CheckSanDaiSiDai(7,isSelectCard)){
                return 7;  //3带2
            }
            
            

            else if(this.CheckSanDaiFeiJi(16,isSelectCard)){
                return 16;  //三带一飞机
            }
            else if(this.CheckSanDaiFeiJi(17,isSelectCard)){
                return 17;  //三带一对飞机
            }
            else if(this.CheckSanDaiFeiJi(18,isSelectCard)){
                return 18;  //三带二飞机
            }
            else if(this.CheckSanDaiFeiJi(19,isSelectCard)){
                return 19;  //三不带飞机
            }
            /*else if(this.CheckFeiJi(3)){
                return 12;  //三带飞机
            }*/
            /*else if(this.CheckFeiJi(4)){
                return 13;  //四带飞机
            }*/
            else if(this.CheckLianDui(isSelectCard)){
                return 14;  //连队
            }
            else{
                return 0;
            }
        }
        else if(this.lastCardType == 2){
            if(this.CheckOneCard(isSelectCard)){
                bCheck = true;
            }
        }
        else if(this.lastCardType == 3){
            if(this.CheckDuizi(isSelectCard)){
                bCheck = true;
            }
        }
        else if(this.lastCardType == 4){
            if(this.CheckShunzi(isSelectCard)){
                bCheck = true;
            }
        }
        else if((this.lastCardType == 5) || (this.lastCardType == 6) || (this.lastCardType == 7) ||
                (this.lastCardType == 8) || (this.lastCardType == 9) || (this.lastCardType == 10) || (this.lastCardType == 15) || (this.lastCardType == 20)){
                // 成都等“不比较附件”的 EITHER 房间把三带一对与三带任意两张
                // 视为同一五张比较族。候选仍保留自身真实牌型，比较时只看
                // 三张主体；PAIRS 房间继续严格要求一对附件。
                if((this.lastCardType == 7 || this.lastCardType == 15)
                    && !this.ComparesTripleAttachments()
                    && this.GetTripleAttachmentMode() === 'EITHER'){
                    bCheck = this.CheckSanDaiSiDai(7,isSelectCard)
                        || this.CheckSanDaiSiDai(15,isSelectCard);
                }
                else if(this.CheckSanDaiSiDai(this.lastCardType,isSelectCard)){
                    bCheck = true;
                }
        }
        else if((this.lastCardType == 12)){
            if(this.CheckFeiJi(3,isSelectCard)){
                bCheck = true;
            }
        }
        else if(this.lastCardType == 13){
            if(this.CheckFeiJi(4,isSelectCard)){
                bCheck = true;
            }
        }
        else if(this.lastCardType == 14){
            if(this.CheckLianDui(isSelectCard)){
                bCheck = true;
            }
        }else if(this.lastCardType >= 16 && this.lastCardType<=19){
            if((this.lastCardType >= 16 && this.lastCardType <= 18)
                && !this.ComparesTripleAttachments()
                && this.GetTripleAttachmentMode() === 'EITHER'){
                bCheck = this.CheckSanDaiFeiJi(16,isSelectCard)
                    || this.CheckSanDaiFeiJi(17,isSelectCard)
                    || this.CheckSanDaiFeiJi(18,isSelectCard);
            }
            else if(this.CheckSanDaiFeiJi(this.lastCardType,isSelectCard)){
                bCheck = true;
            }
        }

        if(bCheck){
            return this.lastCardType;
        }

        return 0;
    }

    public CheckCanOut(){
        let cardType=this.GetCardType();
        if(cardType==0){
            return false;
        }
        if(this.lastCardType==0){
            return true;
        }
        let array = [];
        if(this.lastCardType == 2){
            array = this.GetOneCard(true);
        }
        else if(this.lastCardType == 3){
            array = this.GetDuizi(true);
        }
        else if(this.lastCardType == 4){
            array = this.GetShunzi(true);
        }
        else if(this.lastCardType == 5 || this.lastCardType == 6 ||this.lastCardType == 7 ||this.lastCardType == 15){
            array = this.GetSanDai(true);                
        }
        else if(this.lastCardType == 9 || this.lastCardType == 10 || this.lastCardType ==20 || this.lastCardType == 8){
            array = this.GetSiDai(true)
            console.log(array)
        }
        else if(this.lastCardType == 11){
            array = this.GetZhaDan(true);
            console.log(array)
        }

        else if(this.lastCardType >= 16 && this.lastCardType<=19){
            array = this.GetSanDaiFeiJi(3,true);
        }
        else if(this.lastCardType == 14){
            array = this.GetLianDui(true);
        }
        if(array.length>0){
            return true;
        }else{
            return false;
        }
    }

    public GetTipCardSlCard(){
        let array = [];
        if(this.lastCardType == 2){
            array = this.GetOneCard(true);
        }
        else if(this.lastCardType == 3){
            array = this.GetDuizi(true);
        }
        else if(this.lastCardType == 4){
            array = this.GetShunzi(true);
        }
        else if(this.lastCardType == 5 || this.lastCardType == 6 ||this.lastCardType == 7 ||this.lastCardType == 15){
            array = this.GetSanDai(true);                
        }
        else if(this.lastCardType == 8 || this.lastCardType == 9 ||this.lastCardType == 10 || this.lastCardType == 20){
            array = this.GetSiDai(true);
        }
        else if(this.lastCardType == 11){
            array = this.GetZhaDan(true);
        }

        else if(this.lastCardType >= 16 && this.lastCardType<=19){
            array = this.GetSanDaiFeiJi(3,true);
        }
        /*else if(this.lastCardType == 12){
            array = this.GetFeiJi(3);
        }*/
        /*else if(this.lastCardType == 13){
            array = this.GetFeiJi(4,true);
        }*/
        else if(this.lastCardType == 14){
            array = this.GetLianDui(true);
        }else if(this.lastCardType==0){
            //随意出牌
            array.push.apply(array, this.GetDuiziTip(true));
            array.push.apply(array, this.GetShunziTip(true));
            if(this.AllowsTripleSingles()){
                array.push.apply(array, this.GetSanDaiTip(6,true));
            }
            // Two loose wings are a distinct authority capability; allowing one
            // wing must never make the legacy lead enumerator synthesize two.
            if(this.AllowsTripleTwoSingles()){
                array.push.apply(array, this.GetSanDaiTip(7,true));
            }
            if(this.AllowsTriplePairs()){
                array.push.apply(array, this.GetSanDaiTip(15,true));    
            }
            if(this.Room.GetRoomPaiXing('SiDaiYi')){
                array.push.apply(array, this.GetSiDaiTip(8,true));
            }
            if(this.Room.GetRoomPaiXing('SiDaiEr')){
                array.push.apply(array, this.GetSiDaiTip(9,true));
            }
            if(this.Room.GetRoomPaiXing('SiDaiSan')){
                array.push.apply(array, this.GetSiDaiTip(20,true));
            }
            array.push.apply(array, this.GetZhaDanTip(true));
            if(this.AllowsTripleSingles()){
                array.push.apply(array, this.GetSanDaiFeiJiTip(16,3,true));
            }
            if(this.AllowsTriplePairs()){
                array.push.apply(array, this.GetSanDaiFeiJiTip(17,3,true));
            }
            if(this.AllowsTripleTwoSingles()){
                array.push.apply(array, this.GetSanDaiFeiJiTip(18,3,true));
            }
            if(this.Room.GetRoomPaiXing('SanBuDai')){
                array.push.apply(array, this.GetSanDaiFeiJiTip(19,3,true));
            }
            array.push.apply(array, this.GetLianDuiTip(true));
        }
        if(array.length>0){
            array.sort(this.SortByLength);
        }
        return array;
    }
    public SortByLength(a,b){
        if(a.length>b.length){
            return -1;
        }
        return 1;
    }
    public GetTipCard(){
        let array = [];
        console.log('拿到提示牌',this.lastCardType)
        if(this.lastCardType == 2){
            array = this.GetOneCard();
        }
        else if(this.lastCardType == 3){
            array = this.GetDuizi();
        }
        else if(this.lastCardType == 4){
            array = this.GetShunzi();
        }
        else if(this.lastCardType == 5 || this.lastCardType == 6 ||this.lastCardType == 7 ||this.lastCardType == 15){
            array = this.GetSanDai();       
        }
        else if(this.lastCardType == 8 || this.lastCardType == 9 ||this.lastCardType == 10 || this.lastCardType == 20){
            array = this.GetSiDai();
        }
        else if(this.lastCardType == 11){
            array = this.GetZhaDan();
        }

        else if(this.lastCardType >= 16 && this.lastCardType<=19){
            array = this.GetSanDaiFeiJi(3);
        }
        /*else if(this.lastCardType == 12){
            array = this.GetFeiJi(3);
        }*/
        /*else if(this.lastCardType == 13){
            array = this.GetFeiJi(4);
        }*/
        else if(this.lastCardType == 14){
            array = this.GetLianDui();
        }
        return array;
    }

    public CheckSelected(cardValue){
        if (-1 == this.selectCardList.indexOf(cardValue)){
            return false;
        }
        return true;
    }

    //0:可以随便出牌 1:不出 2:单牌 3:对子 4:顺子 5:3不带 6:3带1 7:3带2 8:4带1 9:4带2 10:4带3 
    //11:炸弹 12:三带飞机 13:四带飞机 14:连对  15:三带一对

    public GetZhaDanTip(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        let zhadans = [];
        
        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let zhadan = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(zhadans, poker);
            if(zhadan.length == 4 && !bInList){
                zhadans[zhadans.length] = zhadan;
            }
            if(this.HasSpecialTripleBombRank(14)){
                if(zhadan.length == 3 && !bInList && this.GetCardValue(zhadan[0]) == 14){
                    zhadans[zhadans.length] = zhadan;
                }
            }
            
        }
        //补牌
        // if(this.Room.GetRoomPaiXing('SiDaiYi')==true){
        //     this.GetOtherCard(zhadans, 1,isSelectCard);
        // }
        return zhadans;
    }

    public GetZhaDan(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        console.log('拿到炸弹牌组',pokers)
        let zhadans = [];

        let lastCardValue = 0;

        for(let i = this.lastCardList.length - 1; i >= 0; i--){
            let lastzhadan = this.GetSameValue(this.lastCardList, this.lastCardList[i]);
            if(lastzhadan.length >= 3){
                lastCardValue = this.GetCardValue(this.lastCardList[i]);
                break;
            }
        }
        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let zhadan = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(zhadans, poker);
            if(zhadan.length == 4 && !bInList && this.GetCardValue(zhadan[0]) > lastCardValue){
                zhadans[zhadans.length] = zhadan;
            }
            if(this.HasSpecialTripleBombRank(14)){
                if(zhadan.length == 3 && !bInList && this.GetCardValue(zhadan[0]) == 14){
                    zhadans[zhadans.length] = zhadan;
                }
            }
            
        }
        //补牌
        // if(this.Room.GetRoomPaiXing('SiDaiYi')==true){
        //     this.GetOtherCard(zhadans, 1,isSelectCard);
        // }
        console.log('拿到炸弹',zhadans)
        return zhadans;
    }

   


    public GetZhaDanEx(array,isSelectCard){
        let pokers = [];
        if(isSelectCard==false){
             pokers = this.handCardList;
        }else{
             pokers = this.selectCardList;
        }
        
        let zhadans = [];
        let arrLen = array.length;//先记录下原来数组的长度，方便后续插入三A炸弹
        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let zhadan = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(zhadans, poker);
            if(zhadan.length == 4 && !bInList){
                zhadans[zhadans.length] = zhadan;
            }
            //是否有3A炸玩法
            if(this.HasSpecialTripleBombRank(14)){
                if(zhadan.length == 3 && this.GetCardValue(zhadan[0]) == 14 && !bInList){
                    
                    zhadans[zhadans.length] = zhadan;
                }
            }
        }
        //补牌
        if(this.Room.GetRoomPaiXing('SiDaiYi')==true){
            //this.GetOtherCard(zhadans, 1,isSelectCard);
        }
        // 三带附件形态由权威 ruleOptions.tripleAttachmentMode 决定。

        // }
        for(let i = zhadans.length - 1; i >= 0; i--){
            let item = zhadans[i];
            array.push(item);
        }
        
        
    }

    public PushTipCard(pokers, samePoker, len){
        let temp = [];
        samePoker.reverse();
        for(let i = 0; i < len; i++){
            temp.push(samePoker[i]);
        }

        pokers.push(temp);
    }

   
    
    public GetOneCard(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let array = [];
        let chai = [];

        let lastCardValue = this.GetCardValue(this.lastCardList[0]);

        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if(cardValue <= lastCardValue) continue;
            let sameValue = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(chai, poker);
            if(sameValue.length == 1){
                this.PushTipCard(array, sameValue, 1);
            }
            else if(sameValue.length > 1 && !bInList){
                this.PushTipCard(chai, sameValue, 1);
            }
        }
        array.push.apply(array, chai);

        this.GetZhaDanEx(array,isSelectCard);

        return array;
    }

    public GetDuiziTip(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let duizis = [];
        let chai = [];
        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(duizis, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(duizi.length == 2 && !bInList){
                this.PushTipCard(duizis, duizi, 2);
            }
            else if(duizi.length > 2 && !bInListEx){
                this.PushTipCard(chai, duizi, 2);
            }
        }
        duizis.push.apply(duizis, chai);
        return duizis;
    }
   
    public GetDuizi(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let duizis = [];
        let chai = [];
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = this.GetCardValue(this.lastCardList[0]);

        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if(cardValue <= lastCardValue) continue;
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(duizis, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(duizi.length == 2 && !bInList){
                this.PushTipCard(duizis, duizi, 2);
            }
            else if(duizi.length > 2 && !bInListEx){
                this.PushTipCard(chai, duizi, 2);
            }
        }
        duizis.push.apply(duizis, chai);
        this.GetZhaDanEx(duizis,isSelectCard);
        return duizis;
    }
    
    public GetShunziTip(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let array = [];
        for(let i = pokers.length - 1; i >= 0; i--){
            let lastValue = 0;
            let shunzi = [];
            shunzi.push(pokers[i]);
            for(let j = i; j >= 0; j--){
                let poker = pokers[j];
                let nowValue = this.GetCardValue(poker);
                if(nowValue == lastValue) continue;
                if(nowValue == 15){
                    break;
                }
                if(lastValue != 0){
                    if(nowValue - lastValue != 1){
                        break;
                    }
                    shunzi.push(poker);   
                }
                lastValue = nowValue;
                if(shunzi.length >= this.GetMinimumStraightLength()){
                    array[array.length] = shunzi;
                }
            }
        }
        return array;
    }

    public GetShunzi(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let array = [];
        // if(pokers.length < this.lastCardList.length) return [];

        this.SortCardByMinEx(this.lastCardList);
        let lastCardValue = this.GetCardValue(this.lastCardList[0]);

        for(let i = pokers.length - 1; i >= 0; i--){
            let lastValue = 0;
            let shunzi = [];
            shunzi.push(pokers[i]);
            for(let j = i; j >= 0; j--){
                let poker = pokers[j];
                let nowValue = this.GetCardValue(poker);

                if(nowValue == lastValue) continue;

                if(nowValue <= lastCardValue){
                    break;
                }
                if(nowValue == 15){
                    break;
                }
                if(lastValue != 0){
                    if(nowValue - lastValue != 1)
                        break;
                    shunzi.push(poker);   
                }
                
                if(shunzi.length >= this.lastCardList.length){
                    array[array.length] = shunzi;
                    break;
                }
                lastValue = nowValue;
            }
        }
        this.GetZhaDanEx(array,isSelectCard);
        return array;
    }

    public GetSanDaiTip(lastCardType,isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let santiaos = [];
        let chai = [];
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(santiaos, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(santiao.length == 3 && !bInList){
                this.PushTipCard(santiaos, santiao, 3);
            }
        }
        this.SortCardByMin(santiaos);
        this.SortCardByMin(chai);

        santiaos.push.apply(santiaos, chai);


        if(lastCardType == 6){
            this.GetOtherCard(santiaos, 1,isSelectCard);
        }else if(lastCardType == 7){
            this.GetOtherCard(santiaos, 2,isSelectCard);
        }else if(lastCardType == 15){
            //获取其他牌一对
            this.GetOtherCardDui(santiaos, 2,isSelectCard);
        }
        return santiaos;
    }

    public GetSiDaiTip(lastCardType,isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let sitiaos = [];
        let chai = [];
        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            let sitiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(sitiaos, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(sitiao.length == 4 && !bInList){
                this.PushTipCard(sitiaos, sitiao, 4);
            }
        }
        this.SortCardByMin(sitiaos);
        this.SortCardByMin(chai);

        sitiaos.push.apply(sitiaos, chai);


        if(lastCardType == 8){
            this.GetOtherCard(sitiaos, 1,isSelectCard);
        }else if(lastCardType == 9){
            this.GetOtherCard(sitiaos, 2,isSelectCard);
        }
        else if(lastCardType == 10){
            this.GetOtherCard(sitiaos,3,isSelectCard);
        }else if(lastCardType == 20){
            // 四带两对需要补足四张附件。
            this.GetOtherCardDui(sitiaos, 4,isSelectCard);
        }
        return sitiaos;
    }

    public GetSanDai(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let santiaos = [];
        let chai = [];
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = 0;

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let santiao = this.GetSameValue(this.lastCardList, poker);
            if(santiao.length >= 3){
                lastCardValue = this.GetCardValue(santiao[0]);
                break;
            }
        }

        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if(cardValue <= lastCardValue) continue;
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(santiaos, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(santiao.length == 3 && !bInList){
                this.PushTipCard(santiaos, santiao, 3);
            }

            /*else if(santiao.length > 3 && !bInListEx){
                this.PushTipCard(chai, santiao, 3);
            }*/
        }

        this.SortCardByMin(santiaos);
        this.SortCardByMin(chai);

        santiaos.push.apply(santiaos, chai);
        if(this.lastCardType == 6){
            this.GetOtherCard(santiaos,1,isSelectCard);
        }
        else if(this.lastCardType == 7){
            this.GetOtherCard(santiaos,2,isSelectCard);
        }else if(this.lastCardType == 15){
            if(!this.ComparesTripleAttachments() && this.GetTripleAttachmentMode() === 'EITHER'){
                this.GetOtherCard(santiaos,2,isSelectCard);
            }else{
                // 必须带一样时只允许补一对。
                this.GetOtherCardDui(santiaos,2,isSelectCard);
            }
        }
        this.GetZhaDanEx(santiaos,isSelectCard);
        return santiaos;
    }

    public GetSiDai(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let zhadans = [];
        let chai = [];
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = 0;

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let zhadan = this.GetSameValue(this.lastCardList, poker);
            if(zhadan.length == 4){
                lastCardValue = this.GetCardValue(zhadan[0]);
                break;
            }
        }

        for(let i = 0; i < pokers.length; i++){
            let poker = pokers[i];
            let cardValue = this.GetCardValue(poker);
            if(cardValue <= lastCardValue) continue;
            let zhadan = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(zhadans, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(zhadan.length == 4 && !bInList){
                this.PushTipCard(zhadans, zhadan, 4);
            }
            else if(zhadan.length > 4 && !bInListEx){
                this.PushTipCard(chai, zhadan, 4);
            }
        }

        zhadans.push.apply(zhadans, chai);
        if(this.lastCardType == 8){
            this.GetOtherCard(zhadans,1,isSelectCard);
        }
        else if(this.lastCardType == 9){
            this.GetOtherCard(zhadans,2,isSelectCard);
        }
        else if(this.lastCardType == 10){
            this.GetOtherCard(zhadans,3,isSelectCard);
        }
        else if(this.lastCardType == 20){
            this.GetOtherCardDui(zhadans,2,isSelectCard);
        }

        this.GetZhaDanEx(zhadans,isSelectCard);
        return zhadans;
    }

    //得到真正的飞机
    public GetRealPlane(lists){
        let lastValue = 0;
        let realPlane = [];
        for(let i = 0; i < lists.length; i++){
            let item = lists[i];
            let nowValue = this.GetCardValue(item[0]);
            
            if(lastValue != 0){
                if((lastValue+1) != nowValue){
                    if(realPlane.length >= 2){
                        break;
                    }
                    realPlane.splice(0, realPlane.length);
                    realPlane[realPlane.length] = item;
                }
                else{
                    realPlane[realPlane.length] = item;
                }
            }
            else{
                realPlane[realPlane.length] = item;
            }

            lastValue = nowValue;
        }

        return realPlane;
    }
    public GetSanDaiFeiJiTip(lastCardType,tag,isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        // if(pokers.length < this.lastCardList.length) return [];

        let tempArrB = [];
        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if(santiao.length >= tag && !bInList){
                //tempArrB[tempArrB.length] = santiao;
                this.RegularCard(tempArrB, santiao, tag);
            }
        }

        //如果第一次检测三条小于2对 肯定凑不成飞机
        if(tempArrB.length < 2){
            return [];
        }
        
        this.SortCardByMin(tempArrB);

        //tempArrB里的三带或四带飞机找出来 去除不用的三条或四条
        let temp = [];
        let tempT=[];
        let lastValue = 0;
        for(let i = 0; i < tempArrB.length; i++){
            let item = tempArrB[i];
            let nowValue = this.GetCardValue(item[0]);
            if(lastValue != 0){
                if((lastValue+1) != nowValue){
                    if(temp.length>0){
                        tempT.push(temp);
                    }
                    temp.splice(0, temp.length);
                    temp[temp.length] = item;
                }
                else{
                    temp[temp.length] = item;
                }
            }
            else{
                temp[temp.length] = item;
            }
            
            lastValue = nowValue;
        }
        if(temp.length>0){
            tempT.push(temp);
        }
        if(tempT.length>0){
            tempT.sort(this.SortByLength);
            temp=tempT[0];
        }
        //将真正的飞机合并成一个数组
        let realPlane = [];
        if(temp.length){
            let tp = [];
            for(let i = 0; i < temp.length; i++){
                let item = temp[i];
                for(let j = 0; j < item.length; j++){
                    tp.push(item[j]);
                }
            }
            realPlane[realPlane.length] = tp;
        }
        
        if(realPlane.length){
            if(this.AllowsTripleSingles() && lastCardType==16){
                this.GetOtherCard(realPlane,realPlane[0].length/3,isSelectCard);
            }
            else if(this.AllowsTriplePairs() && lastCardType==17){
                this.GetOtherCardDui(realPlane,(realPlane[0].length/3)*2,isSelectCard);
            }
            else if(this.AllowsTripleSingles() && lastCardType==18){
                this.GetOtherCard(realPlane,(realPlane[0].length/3)*2,isSelectCard);
            }else if(this.Room.GetRoomPaiXing('SanBuDai') && lastCardType==19){
                this.GetOtherCard(realPlane,0,isSelectCard);
            }
        }
        return realPlane;
    }
    public GetSanDaiFeiJi(tag,isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let santiao = this.GetSameValue(this.lastCardList, poker);
            let bInList = this.CheckPokerInList(tempArrA, poker);
            if(santiao.length >= tag && !bInList){
                //tempArrA[tempArrA.length] = santiao;
                this.RegularCard(tempArrA, santiao, tag);
            }
        }

        this.SortCardByMin(tempArrA);
        let realPlaneA = [];
        if(tempArrA.length){
            realPlaneA = this.GetRealPlane(tempArrA)
            lastCardValue = this.GetCardValue(realPlaneA[0][0]);
        }

        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if(santiao.length >= tag && !bInList){
                //tempArrB[tempArrB.length] = santiao;
                this.RegularCard(tempArrB, santiao, tag);
            }
        }

        //如果第一次检测三条小于2对 肯定凑不成飞机
        if(tempArrB.length < 2){
            let zhadan = [];
            this.GetZhaDanEx(zhadan,isSelectCard);
            return zhadan;
        }
        
        this.SortCardByMin(tempArrB);

        //tempArrB里的三带或四带飞机找出来 去除不用的三条或四条
        let tempT=[];
        let temp = [];
        let lastValue = 0;
        for(let i = 0; i < tempArrB.length; i++){
            if(this.GetCardValue(tempArrB[i][0]) <= lastCardValue) continue;
            if(temp.length == realPlaneA.length) break;

            let item = tempArrB[i];
            let nowValue = this.GetCardValue(item[0]);
            
            if(lastValue != 0){
                if((lastValue+1) != nowValue){
                    if(temp.length>0){
                        tempT.push(temp);
                    }
                    temp.splice(0, temp.length);
                    temp[temp.length] = item;
                }
                else{
                    temp[temp.length] = item;
                }
            }
            else{
                temp[temp.length] = item;
            }
            
            lastValue = nowValue;
        }
        if(temp.length>0){
            tempT.push(temp);
        }
        if(tempT.length>0){
            tempT.sort(this.SortByLength);
            temp=tempT[0];
        }
        //如果飞机数量不足 返回空
        if(temp.length < realPlaneA.length){
            let zhadan = [];
            this.GetZhaDanEx(zhadan,isSelectCard);
            return zhadan;
        }
        //将真正的飞机合并成一个数组
        let realPlane = [];
        if(temp.length){
            let tp = [];
            for(let i = 0; i < temp.length; i++){
                let item = temp[i];
                for(let j = 0; j < item.length; j++){
                    tp.push(item[j]);
                }
            }

            realPlane[realPlane.length] = tp;
        }
        
        if(realPlane.length){
            if(this.AllowsTripleSingles() && this.lastCardType==16){
                this.GetOtherCard(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
            }
            else if(this.AllowsTriplePairs() && this.lastCardType==17){
                this.GetOtherCardDui(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
            }
            else if(this.AllowsTripleSingles() && this.lastCardType==18){
                this.GetOtherCard(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
            }else if(this.Room.GetRoomPaiXing('SanBuDai') && this.lastCardType==19){
                this.GetOtherCard(realPlane,0,isSelectCard);
            }
        }
        
        this.GetZhaDanEx(realPlane,isSelectCard);
        return realPlane;
    }

    public GetFeiJi(tag,isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        for(let i = 0; i < this.lastCardList.length; i++){
            let poker = this.lastCardList[i];
            let santiao = this.GetSameValue(this.lastCardList, poker);
            let bInList = this.CheckPokerInList(tempArrA, poker);
            if(santiao.length >= tag && !bInList){
                //tempArrA[tempArrA.length] = santiao;
                this.RegularCard(tempArrA, santiao, tag);
            }
        }

        this.SortCardByMin(tempArrA);
        let realPlaneA = [];
        if(tempArrA.length){
            realPlaneA = this.GetRealPlane(tempArrA)
            lastCardValue = this.GetCardValue(realPlaneA[0][0]);
        }

        for(let i=0; i < pokers.length; i++){
            let poker = pokers[i];
            let santiao = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInList(tempArrB, poker);
            if(santiao.length >= tag && !bInList){
                //tempArrB[tempArrB.length] = santiao;
                this.RegularCard(tempArrB, santiao, tag);
            }
        }

        //如果第一次检测三条小于2对 肯定凑不成飞机
        if(tempArrB.length < 2){
            let zhadan = [];
            this.GetZhaDanEx(zhadan,isSelectCard);
            return zhadan;
        }
        
        this.SortCardByMin(tempArrB);

        //tempArrB里的三带或四带飞机找出来 去除不用的三条或四条
        let temp = [];
        let tempT=[];
        let lastValue = 0;
        for(let i = 0; i < tempArrB.length; i++){
            if(this.GetCardValue(tempArrB[i][0]) <= lastCardValue) continue;
            if(temp.length == realPlaneA.length) break;

            let item = tempArrB[i];
            let nowValue = this.GetCardValue(item[0]);
            
            if(lastValue != 0){
                if((lastValue+1) != nowValue){
                    if(temp.length>0){
                        tempT.push(temp);
                    }
                    temp.splice(0, temp.length);
                    temp[temp.length] = item;
                }
                else{
                    temp[temp.length] = item;
                }
            }
            else{
                temp[temp.length] = item;
            }
            
            lastValue = nowValue;
        }
        if(temp.length>0){
            tempT.push(temp);
        }
        if(tempT.length>0){
            tempT.sort(this.SortByLength);
            temp=tempT[0];
        }
        //如果飞机数量不足 返回空
        if(temp.length < realPlaneA.length){
            let zhadan = [];
            this.GetZhaDanEx(zhadan,isSelectCard);
            return zhadan;
        }
        //将真正的飞机合并成一个数组
        let realPlane = [];
        if(temp.length){
            let tp = [];
            for(let i = 0; i < temp.length; i++){
                let item = temp[i];
                for(let j = 0; j < item.length; j++){
                    tp.push(item[j]);
                }
            }

            realPlane[realPlane.length] = tp;
        }
        
        if(realPlane.length){
            if(tag==3){
                if(this.AllowsTripleSingles()){
                    this.GetOtherCard(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
                }
                else if(this.AllowsTriplePairs()){
                    this.GetOtherCardDui(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
                }
                else if(this.AllowsTripleSingles()){
                    this.GetOtherCard(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
                }
            }else if(tag==4){
                this.GetOtherCard(realPlane, this.lastCardList.length - realPlane[0].length,isSelectCard);
            }
        }
        
        this.GetZhaDanEx(realPlane,isSelectCard);
        return realPlane;
    }

    public GetLianDuiTip(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        // if(pokers.length < this.lastCardList.length) return [];

        let tempArrB = [];

        
        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(tempArrB, poker);
            if(duizi.length >= 2 && !bInList){
                this.PushTipCard(tempArrB, duizi, 2);
            }
        }
        
        this.SortCardByMin(tempArrB);

        let temps = [];
        for(let i = 0; i < tempArrB.length; i++){
            let tp = [];
            tp.push.apply(tp, tempArrB[i]);
            let lastValue = 0;
            lastValue = this.GetCardValue(tempArrB[i][0]);
            for(let j = i+1; j < tempArrB.length; j++){
                let item = tempArrB[j];
                let nowValue = this.GetCardValue(item[0]);
            
                if(nowValue == 15){
                    break;
                }
    
                if((lastValue+1) != nowValue){
                    break;
                }
                tp.push.apply(tp, item);
                lastValue = nowValue;
                if(tp.length >= 4){
                    temps[temps.length] = tp;
                }
            }
        }
        return temps;
    }

    public GetLianDui(isSelectCard=false){
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        // if(pokers.length < this.lastCardList.length) return [];

        let lastCardValue = 0;
        let tempArrA = [];
        let tempArrB = [];

        this.SortCardByMinEx(this.lastCardList);
        lastCardValue = this.GetCardValue(this.lastCardList[0]);
        tempArrA = this.lastCardList;
        
        for(let i = pokers.length - 1; i >= 0; i--){
            let poker = pokers[i];
            let duizi = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(tempArrB, poker);
            if(duizi.length >= 2 && !bInList){
                this.PushTipCard(tempArrB, duizi, 2);
            }
        }
        
        this.SortCardByMin(tempArrB);

        let temps = [];
        for(let i = 0; i < tempArrB.length; i++){
            let tp = [];
            if(this.GetCardValue(tempArrB[i][0]) <= lastCardValue) continue;
            tp.push.apply(tp, tempArrB[i]);
            let lastValue = 0;
            lastValue = this.GetCardValue(tempArrB[i][0]);
            for(let j = i+1; j < tempArrB.length; j++){
                let item = tempArrB[j];
                let nowValue = this.GetCardValue(item[0]);
            
                if(nowValue == 15){
                    break;
                }
    
                if((lastValue+1) != nowValue){
                    break;
                }

                tp.push.apply(tp, item);
                lastValue = nowValue;

                if(tp.length == tempArrA.length){
                    temps[temps.length] = tp;
                    break;
                }
            }
        }

        this.GetZhaDanEx(temps,isSelectCard);
        return temps;
    }


  


    public GetOtherCard(list, tag,isSelectCard=false){
        if(!list.length) return;
        let pokers =[];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let needPokersCount = 0;
        for (let i = 0; i < list.length; i++) {
            needPokersCount = list[i].length + tag;
        }

        let temp = [];
        let chai = [];
        for(let i = pokers.length -1; i >= 0; i--){
            let poker = pokers[i];
            let cards = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(temp, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(cards.length == 1 && !bInList){
                this.PushTipCard(temp, cards, 1);
            }
            else if(cards.length >= 2 && !bInListEx){
                this.PushTipCard(chai, cards, 2);
            }
        }

        temp.push.apply(temp, chai);
        //先将list拷贝出来
        let tempList = [];
        tempList = list;
        //将获得的牌加入三条,四条或者飞机之中
        for(let i = 0; i < tempList.length; i++){
            let item = tempList[i];
            let len = item.length;
            for(let j = 0; j < temp.length; j++){
                if(list[i].length - len == tag){
                    break;
                }
                let tp = temp[j];
                for(let k = 0; k < tp.length; k++){
                    if(list[i].length - len == tag){
                        break;
                    }
                    if(item.indexOf(tp[k]) == -1){
                        //将获得的带牌加入list
                        list[i].push(tp[k]);
                    }
                }
            }
        }
        //判断下如果加入的牌还不够上家的牌型并且手上还有牌需要补充
        let curPokersCount = 0;
        for (let i = 0; i < list.length; i++) {
            curPokersCount = list[i].length;
        }
        if (curPokersCount < needPokersCount) {
            for (let i = 0; i < list.length; i++) {
                for (let j = 0; j < pokers.length; j++) {
                    if (list[i].indexOf(pokers[j]) == -1) {
                        //将获得的带牌加入list
                        list[i].push(pokers[j]);
                        if (list[i].length == needPokersCount) {
                            break;
                        }
                    }
                }
            }
        }
    }
    /*
    这个函数的作用是，获取三带一对，飞机三带一对也可以获取
     */
    public GetOtherCardDui(list, tag,isSelectCard=false){
        if(!list.length) return;
        let pokers = [];
        if(isSelectCard==false){
            pokers = this.handCardList;
        }else{
            pokers = this.selectCardList;
        }
        let needPokersCount = 0;
        for (let i = 0; i < list.length; i++) {
            needPokersCount = list[i].length + tag;
        }

        let temp = [];
        let chai = [];
        for(let i = pokers.length -1; i >= 0; i--){
            let poker = pokers[i];
            let cards = this.GetSameValue(pokers, poker);
            let bInList = this.CheckPokerInListEx(temp, poker);
            let bInListEx = this.CheckPokerInListEx(chai, poker);
            if(cards.length == 2 && !bInList){
                //取出所有的两张的牌
                this.PushTipCard(temp, cards, 2);
            }
            else if(cards.length >= 3 && !bInListEx){
                //取出所有的大于两张的牌
                this.PushTipCard(chai, cards, 2);
            }
        }

        temp.push.apply(temp, chai);  //两张的优先获取，不足再从超过3张的补牌,取不到取单牌补，因为有最受一手的情况
        //先将list拷贝出来
        let tempList = [];
        tempList = list;
        //将获得的牌加入三条,四条或者飞机之中
        for(let i = 0; i < tempList.length; i++){
            let item = tempList[i];
            let len = item.length;
            for(let j = 0; j < temp.length; j++){
                if(list[i].length - len == tag){
                    //牌已经取满
                    break;
                }
                let tp = temp[j];
                for(let k = 0; k < tp.length; k++){
                    if(list[i].length - len == tag){
                        //牌已经取满
                        break;
                    }
                    if(item.indexOf(tp[k]) == -1){
                        //将获得的带牌加入list
                        list[i].push(tp[k]);
                    }
                }
            }
        }
        //判断下如果加入的牌还不够上家的牌型并且手上还有牌需要补充
        let curPokersCount = 0;
        for (let i = 0; i < list.length; i++) {
            curPokersCount = list[i].length;
        }
        if (curPokersCount < needPokersCount && !this.Room.GetRoomPaiXing('SanBuDai')) {
            //带的牌型不够，没有三不带
            list.splice(0, list.length);
            return;
        }
        if (curPokersCount < needPokersCount  && pokers.length!=this.handCardList.length){
            //带的牌型不够，没有全选牌
            list.splice(0, list.length);
            return;
        }
        if (curPokersCount < needPokersCount  && pokers.length>needPokersCount){
            //带的牌型不够，选中的牌。超过要带的牌了
            list.splice(0, list.length);
            return;
        }
        if (curPokersCount < needPokersCount  && pokers.length==this.handCardList.length){
            //对子已经先带入，欠的补牌中，单排一根当一个对，不能单排一补
            if((needPokersCount-curPokersCount)/2<(pokers.length-curPokersCount)){
                list.splice(0, list.length);
                return;
            }
        }
        if (curPokersCount < needPokersCount) {
            for (let i = 0; i < list.length; i++) {
                for (let j = 0; j < pokers.length; j++) {
                    if (list[i].indexOf(pokers[j]) == -1) {
                        //将获得的带牌加入list
                        list[i].push(pokers[j]);
                        if (list[i].length == needPokersCount) {
                            break;
                        }
                    }
                }
            }
        }
    }


///////////////////////////common///////////////////////////////////////
    public CheckPokerInList(list, tagCard){ 
        if (list.length == 0) return false;

        let bInList = false;
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let pos = item.indexOf(tagCard);
        
            if (pos >= 0){
                bInList = true;
            }
        }
        return bInList
    }

    public CheckPokerInListEx(list, tagCard){
        if (list.length == 0) return false;
        
        let bInList = false;
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let cardValue = this.GetCardValue(item[0]);
            let tagValue = this.GetCardValue(tagCard);

            if(cardValue == tagValue){
                bInList = true;
            }
        }
        return bInList;
    }
    
    //获取同一牌值
    public GetSameValue(pokers, tagCard){ 
        let sameValueList = [];
        let tagCardValue = this.GetCardValue(tagCard);
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerValue = this.GetCardValue(poker);

            if (tagCardValue == pokerValue){
                sameValueList[sameValueList.length] = poker;
            }
        }
        return sameValueList
    }
    //获取同一花色
    public GetSameColor(pokers, tagCard){ 
        let sameColorList = [];
        for (let i = 0; i < pokers.length; i++) {
            let poker = pokers[i];
            let pokerColor = this.GetCardColor(poker);
            let tagCardColor = this.GetCardColor(tagCard);

            if (pokerColor == tagCardColor){
                sameColorList[sameColorList.length] = poker;
            }
        }
        return sameColorList;
    }

    //获取牌值
    public GetCardValue(poker){
        let realPoker = 0;
        if(poker > 500){
            realPoker = poker - 500;
        }
        else{
            realPoker = poker;
        }
        if(realPoker >= 100){
            return realPoker % 100;
        }
        return realPoker&this.LOGIC_MASK_VALUE;
    }

    //获取花色
    public GetCardColor(poker){ 
        let realPoker = 0;
        if(poker > 500){
            realPoker = poker - 500;
        }
        else{
            realPoker = poker;
        }
        if(realPoker >= 100){
            return Math.floor(realPoker / 100);
        }
        return realPoker&this.LOGIC_MASK_COLOR;
    }

    public CompareCardForDisplay(a, b){
        let valueDelta = this.GetCardValue(a) - this.GetCardValue(b);
        if(valueDelta != 0) return valueDelta;
        return this.GetCardColor(a) - this.GetCardColor(b);
    }

    public CheckSameValue(aCards,bCards){
        let bRet = false;
        for(let i = 0; i < aCards.length; i++){
            let poker = aCards[i];
            if(bCards.indexOf(poker) != -1){
                bRet = true;
                break;
            }
        }

        return bRet;
    }
}
