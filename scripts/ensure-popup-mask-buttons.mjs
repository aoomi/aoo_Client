#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const popupPrefabs = [
    'assets/Common/Prefab/Numpad.prefab',
    'assets/Common/Prefab/WaitNet.prefab',
    'assets/Common/Prefab/Message.prefab',
    'assets/Common/Prefab/SettingsPanel.prefab',
    'assets/Modules/CreateRoom/Prefab/CreateRoom.prefab',
    'assets/Modules/Records/Prefab/UserRecord.prefab',
    'assets/Modules/Activity/Social/Prefab/PromoBind.prefab',
    'assets/Modules/Activity/Social/Prefab/Invite.prefab',
    'assets/Modules/Activity/Social/Prefab/ShareImage.prefab',
    'assets/Modules/Activity/Social/Prefab/Share.prefab',
    'assets/Modules/Activity/Social/Prefab/RoomCopy.prefab',
    'assets/Modules/Activity/Social/Prefab/Notice.prefab',
    'assets/Modules/Activity/Prefab/DrawResult.prefab',
    'assets/Modules/Activity/Prefab/DrawHistory.prefab',
    'assets/Modules/Activity/Prefab/CheckIn.prefab',
    'assets/Modules/Rewards/Prefab/InviteRewards.prefab',
    'assets/Modules/Profile/Prefab/Profile.prefab',
    'assets/Modules/Profile/Prefab/PhoneBind.prefab',
    'assets/Modules/Profile/Prefab/RealName.prefab',
    'assets/Modules/Profile/Prefab/Remark.prefab',
    'assets/Modules/Support/Prefab/Feedback.prefab',
    'assets/Modules/Support/Prefab/Service.prefab',
    'assets/Modules/Download/Prefab/Download.prefab',
    'assets/Modules/GiftRoomCard/Prefab/GiftRoomCard.prefab',
];
const whiteSprite = '8b72e55a-8c6d-4cab-a1b3-d76e08972e04@f9941';
const fileId = () => crypto.randomBytes(17).toString('base64').replace(/=/g, '').slice(0, 22);
const prefabInfo = () => ({ __type__: 'cc.CompPrefabInfo', fileId: fileId() });

function component(records, node, type) {
    return (node._components ?? []).map(ref => records[ref.__id__]).find(value => value?.__type__ === type);
}

for (const relative of popupPrefabs) {
    const prefabPath = path.join(projectRoot, relative);
    const records = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const rootIndex = records.findIndex(record => record?.__type__ === 'cc.Node' && !record._parent);
    const root = records[rootIndex];
    if (!root) throw new Error(`${relative}: missing root node`);

    const directChildren = (root._children ?? []).map(ref => records[ref.__id__]).filter(Boolean);
    const existing = directChildren.find(node => /mask/i.test(node._name)
        && (component(records, node, 'cc.UITransform')?._contentSize?.width ?? 0) >= 1200
        && (component(records, node, 'cc.UITransform')?._contentSize?.height ?? 0) >= 650);
    if (existing) {
        existing._name = 'Mask';
        existing._active = true;
        root._children = [
            { __id__: records.indexOf(existing) },
            ...(root._children ?? []).filter(ref => ref.__id__ !== records.indexOf(existing)),
        ];
        const transform = component(records, existing, 'cc.UITransform');
        transform._contentSize = { __type__: 'cc.Size', width: 1600, height: 720 };
        const widget = component(records, existing, 'cc.Widget');
        if (widget) {
            Object.assign(widget, {
                _enabled: true, _alignFlags: 45, _left: 0, _right: 0, _top: 0, _bottom: 0,
                _originalWidth: 1600, _originalHeight: 720,
            });
        }
        let button = component(records, existing, 'cc.Button');
        if (!button) {
            const buttonIndex = records.length;
            const infoIndex = buttonIndex + 1;
            existing._components.push({ __id__: buttonIndex });
            records.push({
                __type__: 'cc.Button', _name: '', _objFlags: 0, __editorExtras__: {},
                node: { __id__: records.indexOf(existing) }, _enabled: true, __prefab: { __id__: infoIndex },
                clickEvents: [], _interactable: true, _transition: 0,
                _normalColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
                _hoverColor: { __type__: 'cc.Color', r: 211, g: 211, b: 211, a: 255 },
                _pressedColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
                _disabledColor: { __type__: 'cc.Color', r: 124, g: 124, b: 124, a: 255 },
                _normalSprite: { __uuid__: whiteSprite, __expectedType__: 'cc.SpriteFrame' },
                _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
                _duration: 0.1, _zoomScale: 1.2, _target: null, _id: '',
            }, prefabInfo());
            button = records[buttonIndex];
        }
        button._enabled = true;
        button._interactable = true;
        fs.writeFileSync(prefabPath, `${JSON.stringify(records, null, 2)}\n`);
        console.log(`${relative}: normalized existing Mask`);
        continue;
    }

    const start = records.length;
    const nodeIndex = start;
    const transformIndex = start + 1;
    const transformInfoIndex = start + 2;
    const spriteIndex = start + 3;
    const spriteInfoIndex = start + 4;
    const buttonIndex = start + 5;
    const buttonInfoIndex = start + 6;
    const widgetIndex = start + 7;
    const widgetInfoIndex = start + 8;
    const nodeInfoIndex = start + 9;
    root._children = [{ __id__: nodeIndex }, ...(root._children ?? [])];
    records.push(
        {
            __type__: 'cc.Node', _name: 'Mask', _objFlags: 0, __editorExtras__: {},
            _parent: { __id__: rootIndex }, _children: [], _active: true,
            _components: [{ __id__: transformIndex }, { __id__: spriteIndex }, { __id__: buttonIndex }, { __id__: widgetIndex }],
            _prefab: { __id__: nodeInfoIndex },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0, _layer: root._layer ?? 33554432,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: '',
        },
        {
            __type__: 'cc.UITransform', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeIndex },
            _enabled: true, __prefab: { __id__: transformInfoIndex },
            _contentSize: { __type__: 'cc.Size', width: 1600, height: 720 },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 }, _id: '',
        },
        prefabInfo(),
        {
            __type__: 'cc.Sprite', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeIndex },
            _enabled: true, __prefab: { __id__: spriteInfoIndex }, _customMaterial: null,
            _srcBlendFactor: 2, _dstBlendFactor: 4,
            _color: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 100 },
            _spriteFrame: { __uuid__: whiteSprite, __expectedType__: 'cc.SpriteFrame' },
            _type: 0, _fillType: 0, _sizeMode: 0,
            _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
            _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: '',
        },
        prefabInfo(),
        {
            __type__: 'cc.Button', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeIndex },
            _enabled: true, __prefab: { __id__: buttonInfoIndex }, clickEvents: [], _interactable: true, _transition: 0,
            _normalColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _hoverColor: { __type__: 'cc.Color', r: 211, g: 211, b: 211, a: 255 },
            _pressedColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _disabledColor: { __type__: 'cc.Color', r: 124, g: 124, b: 124, a: 255 },
            _normalSprite: { __uuid__: whiteSprite, __expectedType__: 'cc.SpriteFrame' },
            _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
            _duration: 0.1, _zoomScale: 1.2, _target: null, _id: '',
        },
        prefabInfo(),
        {
            __type__: 'cc.Widget', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeIndex },
            _enabled: true, __prefab: { __id__: widgetInfoIndex }, _alignFlags: 45, _target: null,
            _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0,
            _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
            _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
            _originalWidth: 1600, _originalHeight: 720, _alignMode: 2, _lockFlags: 0, _id: '',
        },
        prefabInfo(),
        { __type__: 'cc.PrefabInfo', root: { __id__: rootIndex }, asset: { __id__: 0 }, fileId: fileId(), instance: null, targetOverrides: null },
    );
    fs.writeFileSync(prefabPath, `${JSON.stringify(records, null, 2)}\n`);
    console.log(`${relative}: added Mask`);
}
