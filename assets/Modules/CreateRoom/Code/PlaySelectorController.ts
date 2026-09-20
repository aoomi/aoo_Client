import { Button, Director, EventMouse, EventTouch, Label, Layout, Node, UITransform, Vec2, director, game, instantiate, view } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import type { LobbyTopBarController } from '../../../Lobby/Code/LobbyTopBarController';
import { HallCatalogGame, HallRoomGateway } from '../../../Lobby/Code/HallRoomGateway';
import { CreateRoomRulePresenter } from './CreateRoomRulePresenter';
import {
    BrowserKeyValueStorage,
    ScopedPreferenceStore,
    type KeyValueStorage,
    type ScopedPreferenceIdentity,
} from '../../../Common/Code/Runtime/core/Storage';
import { CATALOG_FAMILY_BINDINGS, CATALOG_GAME_METADATA } from '../../../Games/Common/Code/Catalog/CatalogFamilyBindings';
import { ProductionApiError } from '../../../Common/Code/Runtime/Activity/ProductionApiClient';
import { presentationTransition } from '../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { NumpadHandle, NumpadService } from '../../../Common/Code/Runtime/ui/NumpadService';
import { hostRouteStore } from '../../../Common/Code/Runtime/navigation/HostRouteStore';

interface ClubContext { clubId?: number; unionId?: number; gameIndex?: number; cfgData?: Record<string, unknown> | null; templateRoomMode?: boolean; onTemplateSaved?: (room?: unknown) => void | Promise<void>; }
const FORM_PATH = 'UICreateRoom';
const RULES_PATH = 'Rules';
const CLOSE_BUTTON_PATH = 'Top/Btn_Close';
const CREATE_BUTTON_PATH = 'Bottom/Btn_Create';
const NEXT_BUTTON_PATH = 'Bottom/Btn_Next';
const RESET_BUTTON_PATH = 'Top/Btn_Reset';
const BASE_SCORE_BUTTON_PATH = 'Bottom/Ante/Btn_BaseScore';
const BASE_SCORE_LABEL_PATH = 'Bottom/Ante/Btn_BaseScore/Label';

/** 创建房间只编排“权威目录 -> 权威 Schema -> 权威建房”，规则视图由独立 Presenter 管理。 */
export class PlaySelectorController {
    private form: LegacyForm | null = null;
    private selectedGame: HallCatalogGame | null = null;
    private presenter: CreateRoomRulePresenter | null = null;
    private club: ClubContext | null = null;
    private allowedGameKeys = new Set<string>();
    private submitting = false;
    private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    private schemaRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private activeSchemaHash = '';
    private rulesReady = false;
    private generation = 0;
    private selectionGeneration = 0;
    private disposed = false;
    private readonly gameItems: Node[] = [];
    private readonly disposers: Array<() => void> = [];
    private preferenceIdentity: ScopedPreferenceIdentity | null = null;
    private baseScore = 1;
    private baseScoreDraft = '';
    private numpad: NumpadHandle | null = null;
    private readonly numpadService = new NumpadService();
    public constructor(private readonly forms: LegacyFormManager, private readonly host: Node,
        private readonly top: LobbyTopBarController, private readonly gateway: HallRoomGateway,
        private readonly onCreated: (packet: Record<string, unknown>) => Promise<void>,
        private readonly message: (text: string) => void, private readonly accountId: string,
        private readonly preferences = new ScopedPreferenceStore(),
        private readonly recentGameStorage: KeyValueStorage = new BrowserKeyValueStorage()) {}
    public async install(): Promise<void> {
        this.disposed = false;
        this.forms.register(FORM_PATH, { zOrder: 12, modal: false, lifecycle: {
            onCreate: form => this.bind(form),
            onShow: (form, serverPack, gameName, clubData) => {
                this.form = form;
                const incoming = (clubData as ClubContext | null) ?? null;
                if (incoming?.templateRoomMode === true && Number(incoming.clubId ?? 0) <= 0) {
                    const route = hostRouteStore.load(this.accountId);
                    this.club = route?.name === 'club'
                        ? { ...incoming, clubId: route.clubId }
                        : incoming;
                } else this.club = incoming;
                this.allowedGameKeys = this.readAllowedGames(serverPack); this.host.active = false;
                this.rulesReady = false; this.setCreateButtonBusy(false);
                void this.load(String(gameName ?? ''));
            },
            onClose: () => { this.host.active = true; this.reset(); },
            onDestroy: () => this.destroy(),
        }});
    }
    public open(gameName = '', serverPack: unknown = null, clubData: ClubContext | null = null): Promise<unknown> {
        console.info('[CreateRoomSelector]', {
            action: 'OPEN', gameName, disposed: this.disposed,
            formCached: Boolean(this.forms.get(FORM_PATH)?.node.isValid),
        });
        return this.forms.show(FORM_PATH, serverPack, gameName, clubData);
    }
    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.generation += 1;
        if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
        if (this.schemaRefreshTimer !== null) clearTimeout(this.schemaRefreshTimer);
        this.feedbackTimer = null;
        this.schemaRefreshTimer = null;
        this.numpad?.dispose(); this.numpad = null;
        for (const dispose of this.disposers.splice(0)) dispose();
        this.presenter?.destroy(); this.presenter = null; this.form = null;
    }
    private bind(form: LegacyForm): void {
        this.form = form;
        this.presenter = new CreateRoomRulePresenter(this.requireNode(form, RULES_PATH));
        this.onClick(this.requireNode(form, CLOSE_BUTTON_PATH), () => this.forms.close(FORM_PATH));
        this.onClick(this.requireNode(form, CREATE_BUTTON_PATH), () => { void this.submit(); }, form.node.scene ?? form.node);
        this.onClick(this.requireNode(form, NEXT_BUTTON_PATH), () => { void this.openUnionSettings(); }, form.node.scene ?? form.node);
        this.onClick(this.requireNode(form, RESET_BUTTON_PATH), () => this.presenter?.reset());
        this.onClick(this.requireNode(form, BASE_SCORE_BUTTON_PATH), () => { void this.openBaseScoreNumpad(); });
        this.renderBaseScore();
        // 未实现能力必须显式隐藏，不能保留可点击的空成功或旧逻辑旁路。
        for (const path of ['Left/Btn_AddGame', 'Left/Btn_RemoveGame', 'Bottom/Btn_LoadGame']) {
            const node = form.find(path); if (node) node.active = false;
        }
    }
    private async load(preselect: string): Promise<void> {
        this.setStatus('正在读取可创建玩法...');
        try {
            const catalog = await this.gateway.catalog('ALL');
            const implemented = new Set(CATALOG_FAMILY_BINDINGS
                .filter(binding => CATALOG_GAME_METADATA[binding.code]?.enabled)
                .map(binding => Number(CATALOG_GAME_METADATA[binding.code]?.gameId)));
            const implementedFamilies = new Set<string>(CATALOG_FAMILY_BINDINGS
                .filter(binding => CATALOG_GAME_METADATA[binding.code]?.enabled).map(binding => binding.family));
            // 服务端负责发布授权，客户端再与本地运行实现取交集，避免创建成功后才发现没有对应房间代码。
            const games = catalog.filter(game => (implemented.has(Number(game.gameId))
                || implementedFamilies.has(this.runtimeFamily(game.familyCode)))
                && (!this.allowedGameKeys.size || this.allowedGameKeys.has(String(game.gameId))
                    || this.allowedGameKeys.has(game.gameCode.toUpperCase())));
            const recentGameCode = this.loadRecentGameCode();
            const orderedGames = this.prioritizeRecentGame(games, recentGameCode);
            // 显式入口优先；从大厅进入时默认选中最近成功创建的玩法，并保持它位于首行。
            // 首次使用没有历史记录时才回退成都跑得快。
            const selected = this.findGame(orderedGames, preselect)
                ?? this.findGame(orderedGames, recentGameCode)
                ?? orderedGames.find(game => game.gameCode === 'CD201')
                ?? orderedGames[0];
            if (!selected) throw new Error('当前没有可创建玩法');
            this.renderGames(orderedGames, selected);
            await this.selectGame(selected);
        } catch (error: unknown) { this.fail(error, '获取可创建玩法失败，请重试'); }
    }
    private async selectGame(game: HallCatalogGame): Promise<void> {
        if (this.schemaRefreshTimer !== null) clearTimeout(this.schemaRefreshTimer);
        this.schemaRefreshTimer = null; this.activeSchemaHash = '';
        const selectionGeneration = ++this.selectionGeneration;
        this.selectedGame = game; this.rulesReady = false; this.setCreateButtonBusy(false);
        for (const item of this.gameItems) {
            const selected = item.name === `Game_${game.gameCode}`;
            const checked = item.getChildByName('Icon_Selected'); if (checked) checked.active = selected;
            const hot = item.getChildByName('Icon_Hot'); if (hot) hot.active = selected;
        }
        this.setStatus('正在读取房间规则...');
        console.info('[CreateRoomSelector]', {
            action: 'CONFIG_REQUEST', gameCode: game.gameCode, gameId: Number(game.gameId),
            playVersion: game.playVersion, selectionGeneration,
        });
        try {
            const configuration = await this.gateway.configuration(game);
            if (this.disposed || selectionGeneration !== this.selectionGeneration) return;
            const fields = Array.isArray(configuration.ui?.fields) ? configuration.ui.fields : [];
            console.info('[CreateRoomSelector]', {
                action: 'CONFIG_RESPONSE', gameCode: game.gameCode, gameId: Number(game.gameId),
                playVersion: game.playVersion, selectionGeneration, fieldCount: fields.length,
                schemaHash: String(configuration.ui?.roomRuleSourceHash ?? ''),
            });
            if (!fields.length) throw new Error('该玩法尚未发布创建房间规则');
            const schemaHash = String(configuration.ui?.roomRuleSourceHash ?? '');
            this.activeSchemaHash = schemaHash;
            this.preferenceIdentity = { accountId: this.accountId, gameId: Number(game.gameId),
                playVersion: game.playVersion, schemaHash };
            const savedRules = this.preferences.load(this.preferenceIdentity);
            this.baseScore = this.readBaseScore(savedRules);
            this.renderBaseScore();
            this.presenter?.setSchema(fields, savedRules);
            this.rulesReady = true; this.setCreateButtonBusy(false);
            this.scheduleSchemaRefresh(game, selectionGeneration);
            this.setStatus(`${this.visibleGameName(game)} · ${game.playVersion}`);
        } catch (error: unknown) {
            if (this.disposed || selectionGeneration !== this.selectionGeneration) return;
            const production = error instanceof ProductionApiError ? error : null;
            console.error('[CreateRoomSelector]', {
                action: 'CONFIG_FAILED', gameCode: game.gameCode, gameId: Number(game.gameId),
                playVersion: game.playVersion, selectionGeneration,
                name: error instanceof Error ? error.name : typeof error,
                message: error instanceof Error ? error.message : String(error),
                code: production?.code ?? '', status: production?.status ?? 0,
                traceId: production?.traceId ?? '',
            });
            this.rulesReady = false; this.setCreateButtonBusy(false); this.presenter?.clear(); this.fail(error, '玩法规则加载失败');
        } finally {
            console.info('[CreateRoomSelector]', {
                action: 'CONFIG_FINALLY', gameCode: game.gameCode, gameId: Number(game.gameId),
                playVersion: game.playVersion, selectionGeneration,
                activeSelection: selectionGeneration === this.selectionGeneration,
                disposed: this.disposed, rulesReady: this.rulesReady,
            });
        }
    }
    private scheduleSchemaRefresh(game: HallCatalogGame, selectionGeneration: number): void {
        if (this.disposed || selectionGeneration !== this.selectionGeneration) return;
        this.schemaRefreshTimer = setTimeout(() => { void this.refreshSchema(game, selectionGeneration); }, 1000);
    }
    private async refreshSchema(game: HallCatalogGame, selectionGeneration: number): Promise<void> {
        try {
            const configuration = await this.gateway.configuration(game);
            if (this.disposed || selectionGeneration !== this.selectionGeneration
                || Number(this.selectedGame?.gameId) !== Number(game.gameId)) return;
            const fields = Array.isArray(configuration.ui?.fields) ? configuration.ui.fields : [];
            const schemaHash = String(configuration.ui?.roomRuleSourceHash ?? '');
            if (fields.length && schemaHash && schemaHash !== this.activeSchemaHash) {
                this.activeSchemaHash = schemaHash;
                this.preferenceIdentity = { accountId: this.accountId, gameId: Number(game.gameId),
                    playVersion: game.playVersion, schemaHash };
                const savedRules = this.preferences.load(this.preferenceIdentity);
                this.baseScore = this.readBaseScore(savedRules);
                this.renderBaseScore();
                this.presenter?.setSchema(fields, savedRules);
                this.rulesReady = true; this.setCreateButtonBusy(false);
            }
        } catch {
        } finally {
            this.scheduleSchemaRefresh(game, selectionGeneration);
        }
    }
    private async submit(): Promise<void> {
        if (this.disposed || this.submitting) {
            return;
        }
        console.info('[CreateRoomSubmit] click', {
            gameCode: this.selectedGame?.gameCode ?? '',
            gameId: Number(this.selectedGame?.gameId ?? 0),
            rulesReady: this.rulesReady,
            formVisible: this.form?.isShown() === true,
        });
        if (!this.selectedGame || !this.presenter || !this.rulesReady) {
            this.message('房间规则尚未加载完成'); return;
        }
        const selectedGame = this.selectedGame;
        const validation = this.presenter.validate();
        if (!validation.ok) {
            this.showCreateFeedback(validation.message); return;
        }
        // 场景交接会销毁大厅 Presenter；成功记忆必须使用发请求前冻结的同一份规则，
        // 不能在 onCreated 返回后读取已清理的 UI 状态。
        if (!this.isValidBaseScore(this.baseScore)) {
            this.showCreateFeedback('房间底分必须是正数，最多保留两位小数');
            return;
        }
        const submittedRules = { ...this.presenter.snapshot(), baseScore: this.baseScore };
        if (!Object.keys(submittedRules).length) {
            this.rulesReady = false; this.setCreateButtonBusy(false);
            this.message('房间规则尚未准备完成，请重新打开创建房间');
            return;
        }
        const preferenceIdentity = this.preferenceIdentity;
        const generation = this.generation;
        console.info('[CreateRoomSubmit] validated', {
            gameCode: selectedGame.gameCode,
            gameId: Number(selectedGame.gameId),
            playVersion: selectedGame.playVersion,
            scope: Number(this.club?.clubId ?? 0) > 0 ? 'CLUB' : 'PERSONAL',
            ruleKeys: Object.keys(submittedRules).sort(),
        });
        this.submitting = true; this.setCreateButtonBusy(true);
        const submittingForm = this.form;
        // 先抓取创建页已经绘制完成的最后一帧。真实创建节点会在本帧绘制后关闭，
        // 但大厅根节点保持隐藏，随后只允许房间首帧替换该画面。
        const transition = presentationTransition.begin({
            name: `create-room:${selectedGame.gameCode}`,
            message: '正在创建房间...',
            progress: 0.05,
            progressKind: 'STAGE',
            showAfterMs: 0,
            showDuringProgress: false,
            retainCurrentFrame: true,
            timeoutMs: 30_000,
        });
        let hidePending = true;
        let hideFallback: ReturnType<typeof globalThis.setTimeout> | null = null;
        const hideSubmittingForm = (): void => {
            if (!hidePending) return;
            hidePending = false;
            director.off(Director.EVENT_AFTER_DRAW, hideSubmittingForm);
            if (hideFallback !== null) globalThis.clearTimeout(hideFallback);
            hideFallback = null;
            if (submittingForm?.node.isValid) submittingForm.node.active = false;
        };
        director.once(Director.EVENT_AFTER_DRAW, hideSubmittingForm);
        hideFallback = globalThis.setTimeout(hideSubmittingForm, 50);
        try {
            const clubId = Number(this.club?.clubId ?? 0);
            const handoff = await this.gateway.create(selectedGame.gameCode, submittedRules, clubId > 0 ?
                { type: 'CLUB', clubId, templateCode: this.club?.gameIndex ? `template-${this.club.gameIndex}` : 'default' } :
                { type: 'PERSONAL' });
            console.info('[CreateRoomSubmit] created', {
                gameCode: selectedGame.gameCode,
                gameId: Number(selectedGame.gameId),
                roomId: Number(handoff.roomId ?? 0),
                bundleName: String(handoff.bundleName ?? ''),
                sceneName: String(handoff.sceneName ?? ''),
            });
            // 服务端确认建房成功后立即保存；场景交接可能销毁大厅控制器，不能等进入
            // 房间后再写入。校验失败或 gateway.create 抛错时不会执行到这里。
            if (preferenceIdentity) this.preferences.save(preferenceIdentity, submittedRules);
            this.saveRecentGameCode(selectedGame.gameCode);
            if (this.disposed || generation !== this.generation) {
                transition.cancel();
                return;
            }
            transition.update('房间已创建，正在加载房间资源...', 0.12, 'STAGE');
            // 服务端建房成功后关闭真实创建页；展示层仍只保留点击时的创建页末帧，
            // 由房间启动器直接以房间首帧替换，期间不暴露大厅。
            if (this.forms.isAlive()) this.forms.close(FORM_PATH);
            await this.onCreated({ ...handoff, gameId: selectedGame.gameId, gameName: selectedGame.gameCode,
                entryOrigin: clubId > 0 ? 'CLUB' : 'GAME_LOBBY',
                returnContext: clubId > 0 ? { clubId } : undefined,
                ...(clubId > 0 ? { clubId, fromClub: true } : {}) });
            console.info('[CreateRoomSubmit] entered', {
                gameCode: selectedGame.gameCode,
                roomId: Number(handoff.roomId ?? 0),
            });
            await transition.commitAfterPresentation();
            if (this.disposed || generation !== this.generation) return;
        } catch (error: unknown) {
            hidePending = false;
            director.off(Director.EVENT_AFTER_DRAW, hideSubmittingForm);
            if (hideFallback !== null) globalThis.clearTimeout(hideFallback);
            console.error('[CreateRoomSubmit] failed', {
                gameCode: selectedGame.gameCode,
                gameId: Number(selectedGame.gameId),
                error: error instanceof Error ? error.message : String(error),
            });
            transition.fail(error, () => { void this.submit(); });
            // 场景已经移交后旧大厅不再恢复；移交前失败则还原创建页供用户修正规则或重试。
            if (this.forms.isAlive() && submittingForm?.node.isValid) {
                submittingForm.node.active = true;
                this.fail(error, '创建房间失败，请重试');
            }
        }
        finally { this.submitting = false; this.setCreateButtonBusy(false); }
    }
    private onClick(node: Node | null, listener: () => void, captureRoot: Node | null = null): void {
        if (!node) return; const button = node.getComponent(Button);
        if (!button) throw new Error(`创建房间预制体按钮组件缺失: ${node.name}`);
        let lastPointerAt = 0;
        const invokeOnce = (): void => {
            const currentForm = this.form;
            if (this.disposed || !currentForm?.isShown() || !currentForm.node.activeInHierarchy) {
                return;
            }
            // CreateButton 与 NextButton 共用同一布局位置。赛事模式只激活 NextButton，
            // 捕获层也必须遵守节点和按钮状态，否则一次真实点击会同时触发隐藏的创建按钮。
            if (!node.activeInHierarchy || !button.interactable) return;
            const now = Date.now();
            // Creator Web 在嵌套 ScrollView/遮罩下可能只派发原始指针结束事件；同时监听三种
            // 原生事件能保持鼠标与触屏一致。短守卫只合并同一次物理点击产生的重复事件，
            // 业务层仍由 submitting/requestId 提供真正的幂等保护。
            if (now - lastPointerAt < 250) return;
            lastPointerAt = now;
            listener();
        };
        node.on(Button.EventType.CLICK, invokeOnce, this);
        node.on(Node.EventType.TOUCH_END, invokeOnce, this);
        node.on(Node.EventType.MOUSE_UP, invokeOnce, this);
        const invokeWhenInside = (location: Vec2): void => {
            // Web 的 DOM click 晚于 Cocos TOUCH_END 到达。建房交接可能已经切换场景并销毁
            // 创建按钮，此时继续 getComponent 会进入引擎已释放的 _components 数组。
            // 这里按节点生命周期 fail-closed，既阻止迟到事件二次建房，也不掩盖协议数据错误。
            if (!node.isValid) return;
            const transform = node.getComponent(UITransform);
            if (transform?.getBoundingBoxToWorld().contains(location)) invokeOnce();
        };
        const captureTouch = (event: EventTouch): void => invokeWhenInside(event.getUILocation());
        const captureMouse = (event: EventMouse): void => invokeWhenInside(event.getUILocation());
        // 创建按钮位于可滚动遮罩的同级区域。浏览器命中透明遮罩时，按钮本身收不到
        // 冒泡事件；在场景根节点捕获并按按钮真实世界矩形判定，可避免修改用户 Prefab。
        captureRoot?.on(Node.EventType.TOUCH_END, captureTouch, this, true);
        captureRoot?.on(Node.EventType.MOUSE_UP, captureMouse, this, true);
        // DOM/Window 捕获只是提交按钮在 Creator 设备外壳下丢失原生事件时的定向补偿。
        // 普通按钮（尤其左侧动态玩法项）不得注册全局监听，否则模拟器缩放时 DOM 与
        // Cocos 坐标系的换算误差会把规则区点击判进玩法按钮热区。
        const canvas = captureRoot && typeof HTMLCanvasElement !== 'undefined' && game.canvas instanceof HTMLCanvasElement
            ? game.canvas : null;
        const captureDomClick = (event: MouseEvent): void => {
            if (!canvas) return;
            const bounds = canvas.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) return;
            const viewport = view.getViewportRect();
            const scaleX = view.getScaleX();
            const scaleY = view.getScaleY();
            if (scaleX <= 0 || scaleY <= 0) return;
            invokeWhenInside(new Vec2(
                (event.clientX - bounds.left - viewport.x) / scaleX,
                (bounds.bottom - event.clientY - viewport.y) / scaleY,
            ));
        };
        // Creator Preview 外层会缩放 Canvas；个别浏览器下透明调试层会在 Cocos 事件系统
        // 之前截获底部指针。Web 仅在真实 Canvas 内按设计分辨率换算一次，不依赖任何
        // 预制体坐标常量；Native 仍完全走上面的 Cocos 原生事件。
        canvas?.addEventListener('click', captureDomClick, true);
        // Creator Preview 的设备外壳可能位于 Canvas 上方并截获最终 click，导致节点自身、
        // 场景捕获和 Canvas 监听均收不到事件。window 捕获阶段仍以真实 Canvas 边界过滤，
        // 因而只补偿 Preview/Web 的坐标链，不扩大按钮热区，也不改变 Native 行为。
        const captureWindowPointer = (event: MouseEvent): void => captureDomClick(event);
        if (canvas && typeof window !== 'undefined') {
            window.addEventListener('mouseup', captureWindowPointer, true);
            window.addEventListener('click', captureWindowPointer, true);
        }
        this.disposers.push(() => {
            if (node.isValid && (node as unknown as { _eventProcessor?: unknown })._eventProcessor) {
                node.off(Button.EventType.CLICK, invokeOnce, this);
                node.off(Node.EventType.TOUCH_END, invokeOnce, this);
                node.off(Node.EventType.MOUSE_UP, invokeOnce, this);
            }
            if (captureRoot?.isValid && (captureRoot as unknown as { _eventProcessor?: unknown })._eventProcessor) {
                captureRoot.off(Node.EventType.TOUCH_END, captureTouch, this, true);
                captureRoot.off(Node.EventType.MOUSE_UP, captureMouse, this, true);
            }
            canvas?.removeEventListener('click', captureDomClick, true);
            if (canvas && typeof window !== 'undefined') {
                window.removeEventListener('mouseup', captureWindowPointer, true);
                window.removeEventListener('click', captureWindowPointer, true);
            }
        });
    }
    private setCreateButtonBusy(busy: boolean): void {
        const form = this.form;
        if (!this.forms.isAlive() || !form || !form.node.isValid) return;
        const node = form.find(CREATE_BUTTON_PATH); const button = node?.getComponent(Button);
        if (button) button.interactable = this.rulesReady && !busy;
        this.setLabel(CREATE_BUTTON_PATH, busy ? '正在创建...' : this.rulesReady ? '创建房间' : '规则加载中...');
        this.updateSubmitButtons(busy);
    }
    private updateSubmitButtons(busy: boolean): void {
        const unionMode = this.club?.templateRoomMode === true;
        const create = this.form?.find(CREATE_BUTTON_PATH);
        const next = this.form?.find(NEXT_BUTTON_PATH);
        if (create) create.active = !unionMode;
        if (next) {
            next.active = unionMode;
            const button = next.getComponent(Button);
            if (button) button.interactable = this.rulesReady && !busy;
        }
    }
    private async openUnionSettings(): Promise<void> {
        if (this.club?.templateRoomMode !== true) {
            this.message('当前不是俱乐部模板房创建流程');
            return;
        }
        if (!this.selectedGame || !this.presenter || !this.rulesReady) {
            this.message('房间规则尚未加载完成，请稍后再点下一步');
            return;
        }
        // 普通俱乐部没有赛事 unionId（合法值为 0），但仍使用同一套模板参数页。
        // clubId 才是两种保存流程共同且必须存在的上下文。
        if (Number(this.club.clubId ?? 0) <= 0) {
            this.message('俱乐部模板房上下文缺失，请返回俱乐部后重试');
            return;
        }
        const validation = this.presenter.validate();
        if (!validation.ok) { this.message(validation.message); return; }
        const rules = { ...this.presenter.snapshot(), baseScore: this.baseScore };
        await this.forms.show('ui/club/UIClubRoomFee', this.club, this.selectedGame.gameId, {
            ...rules,
            gameId: this.selectedGame.gameId,
            gameCode: this.selectedGame.gameCode,
            gameDisplayName: this.selectedGame.displayName,
            classificationName: this.selectedGame.classificationName,
            playVersion: this.selectedGame.playVersion,
        });
    }
    private showCreateFeedback(text: string): void {
        if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
        this.setLabel(CREATE_BUTTON_PATH, text);
        this.feedbackTimer = setTimeout(() => {
            this.feedbackTimer = null;
            if (!this.submitting) this.setLabel(CREATE_BUTTON_PATH, '创建房间');
        }, 1800);
    }
    private setStatus(text: string): void { if (text.includes('失败')) this.message(text); }
    private setLabel(path: string, text: string): void {
        const node = this.form?.find(path); const label = node?.getComponent(Label) ?? node?.getComponentInChildren(Label);
        if (label) label.string = text;
    }
    private fail(error: unknown, fallback: string): void {
        let text = error instanceof Error && error.message ? error.message : fallback;
        if (error instanceof ProductionApiError && error.code === 'HALL_ALREADY_IN_ANOTHER_ROOM') {
            const roomId = error.message.match(/\b(\d{6})\b/)?.[1];
            text = roomId ? `活动房间 ${roomId}，请先返回` : '已在其他活动房间，请先返回';
        }
        this.message(text);
    }
    private findGame(games: readonly HallCatalogGame[], value: string): HallCatalogGame | undefined {
        const expected = value.trim().toLowerCase();
        return expected ? games.find(game => game.gameCode.toLowerCase() === expected || game.displayName === value
            || String(game.gameId) === value) : undefined;
    }
    private prioritizeRecentGame(games: readonly HallCatalogGame[], recentGameCode: string): HallCatalogGame[] {
        const recent = this.findGame(games, recentGameCode);
        return recent ? [recent, ...games.filter(game => game !== recent)] : [...games];
    }
    private loadRecentGameCode(): string {
        return this.recentGameStorage.get(this.recentGameStorageKey())?.trim() ?? '';
    }
    private saveRecentGameCode(gameCode: string): void {
        const normalized = gameCode.trim();
        if (normalized) this.recentGameStorage.set(this.recentGameStorageKey(), normalized);
    }
    private recentGameStorageKey(): string {
        if (!/^[1-9]\d*$/.test(this.accountId)) throw new Error('最近创建玩法的账号作用域无效');
        return `lobby.recent-created-game.v1.${this.accountId}`;
    }
    private readAllowedGames(serverPack: unknown): Set<string> {
        if (!serverPack || typeof serverPack !== 'object') return new Set();
        const list = (serverPack as { gameList?: unknown[] }).gameList;
        return new Set((Array.isArray(list) ? list : []).flatMap((value) => {
            if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return [String(value)];
            if (typeof value !== 'string') return [];
            const key = value.trim();
            return key ? [/^\d+$/.test(key) ? key : key.toUpperCase()] : [];
        }));
    }
    private runtimeFamily(familyCode: string): string {
        const normalized = String(familyCode ?? '').trim().toLowerCase().replace(/_/g, '-');
        if (!normalized) return '';
        if (normalized.includes(':')) return normalized;
        const parts = normalized.split('-').filter(Boolean);
        if ((parts[0] === 'long' || parts[0] === 'word') && parts[1] === 'card') {
            return `${parts[0]}-card:${parts.slice(2).join('-')}`;
        }
        return `${parts[0]}:${parts.slice(1).join('-')}`;
    }
    private renderGames(games: readonly HallCatalogGame[], selected: HallCatalogGame): void {
        for (const item of this.gameItems.splice(0)) if (item.isValid) item.destroy();
        const prototype = this.form?.find('Left/FavoriteList/ScrollView/Viewport/Btn_Game');
        const content = this.form?.find('Left/FavoriteList/ScrollView/Viewport/Content');
        if (!prototype || !content) throw new Error('创建房间玩法列表模板缺失');
        prototype.active = false;
        for (const game of games) {
            const item = instantiate(prototype); item.name = `Game_${game.gameCode}`; item.active = true;
            const label = item.getChildByName('Label')?.getComponent(Label);
            if (!label) throw new Error('创建房间玩法列表文字节点缺失');
            label.string = this.visibleGameName(game);
            const selectedNode = item.getChildByName('Icon_Selected');
            if (selectedNode) selectedNode.active = game.gameId === selected.gameId;
            const hotNode = item.getChildByName('Icon_Hot');
            if (hotNode) hotNode.active = game.gameId === selected.gameId;
            this.onClick(item, () => { void this.selectGame(game); }); content.addChild(item); this.gameItems.push(item);
        }
        // Cloned entries must have their serialized Layout positions committed before the
        // first pointer event. Otherwise labels render in rows while every Button still
        // shares the prototype hit rectangle and the first game captures all clicks.
        content.getComponent(Layout)?.updateLayout();
    }
    private requireNode(form: LegacyForm, path: string): Node {
        const node = form.find(path);
        if (!node) throw new Error(`创建房间预制体节点缺失: ${path}`);
        return node;
    }
    /** 技术代码只参与协议和资源定位，绝不能直接暴露给玩家。 */
    private visibleGameName(game: HallCatalogGame): string {
        if (!game.displayName?.trim()) throw new Error('玩法目录缺少显示名称');
        return game.displayName.trim();
    }
    private reset(): void {
        this.selectionGeneration += 1;
        if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
        if (this.schemaRefreshTimer !== null) clearTimeout(this.schemaRefreshTimer);
        this.feedbackTimer = null;
        this.schemaRefreshTimer = null; this.activeSchemaHash = '';
        for (const item of this.gameItems.splice(0)) if (item.isValid) item.destroy();
        this.numpad?.dispose(); this.numpad = null; this.baseScoreDraft = ''; this.baseScore = 1;
        this.selectedGame = null; this.preferenceIdentity = null; this.presenter?.clear(); this.club = null; this.allowedGameKeys.clear(); this.submitting = false; this.rulesReady = false;
    }

    private async openBaseScoreNumpad(): Promise<void> {
        if (!this.form || this.numpad) return;
        this.baseScoreDraft = '';
        const close = (): void => { this.numpad?.dispose(); this.numpad = null; this.baseScoreDraft = ''; };
        this.numpad = await this.numpadService.open(this.form.node, () => this.forms.loadCommonNumpad(), {
            close,
            confirm: () => {
                const value = Number(this.baseScoreDraft);
                if (!this.isValidBaseScore(value) || !/^\d+(?:\.\d{1,2})?$/.test(this.baseScoreDraft)) {
                    this.message('房间底分必须是正数，最多保留两位小数');
                    return;
                }
                this.baseScore = value; this.renderBaseScore(); close();
            },
        }, { digitCount: 6, maxDigits: 9, decimalPlaces: 2, value: () => this.baseScoreDraft, setValue: value => { this.baseScoreDraft = value; } }, { title: '设置房间底分' });
    }

    private renderBaseScore(): void {
        const label = this.form?.find(BASE_SCORE_LABEL_PATH)?.getComponent(Label);
        if (!label) throw new Error(`创建房间预制体节点缺失: ${BASE_SCORE_LABEL_PATH}`);
        label.string = String(this.baseScore);
    }

    private readBaseScore(savedRules: Record<string, unknown> | null): number {
        const value = Number(savedRules?.baseScore ?? 1);
        return this.isValidBaseScore(value) ? value : 1;
    }

    private isValidBaseScore(value: number): boolean {
        return Number.isFinite(value) && value > 0 && Math.round(value * 100) === value * 100;
    }
}
