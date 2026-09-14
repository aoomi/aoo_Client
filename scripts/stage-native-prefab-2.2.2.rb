#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'digest'

PROJECT_ROOT = File.expand_path('..', __dir__)
explicit_legacy_root = ENV['LEGACY_ASSETS_ROOT']
LEGACY_ROOTS = ([explicit_legacy_root].compact + [
  File.expand_path('../../client/assets', __dir__),
  File.expand_path('../../client-unified/assets', __dir__),
  File.expand_path('../../../QH_JYTF_client/Client_scjymj/assets', __dir__),
  File.expand_path('../../../情怀1.0前端/客户端 (1)/Client_hzmj/assets', __dir__)
]).map { |path| File.expand_path(path) }.select { |path| Dir.exist?(path) }
abort('legacy client assets directory not found') if LEGACY_ROOTS.empty?
LEGACY_RESOURCE_ROOTS = LEGACY_ROOTS.map { |root| File.join(root, 'resources') }
LEGACY_INTERNAL = File.expand_path('../../client/temp/internal', __dir__)
TARGET_ASSETS = File.join(PROJECT_ROOT, 'assets')
TARGET_LEGACY_ASSETS = ENV['TARGET_LEGACY_ASSETS_ROOT'] || File.join(TARGET_ASSETS, 'resources/legacy-ui/assets')

def walk_files(root, suffix)
  return enum_for(__method__, root, suffix) unless block_given?

  Dir.glob(File.join(root, '**', "*#{suffix}"), File::FNM_DOTMATCH).sort.each do |file|
    yield file if File.file?(file)
  end
end

def index_legacy_meta(value, source, result)
  return unless value.is_a?(Hash)

  result[value['uuid']] = source if value['uuid']
  (value['subMetas'] || {}).each_value { |child| index_legacy_meta(child, source, result) }
end

def sprite_frame_uuid(meta)
  sprite = (meta['subMetas'] || {}).values.find do |child|
    child['importer'] == 'sprite-frame' || child['name'] == 'spriteFrame'
  end
  sprite && sprite['uuid']
end

def target_asset_for(source)
  relative = if source.start_with?("#{LEGACY_INTERNAL}/")
               "internal/#{source.delete_prefix("#{LEGACY_INTERNAL}/")}"
             else
               resource_root = LEGACY_RESOURCE_ROOTS.find { |root| source.start_with?("#{root}/") }
               source.delete_prefix("#{resource_root}/")
             end
  extension = File.extname(relative)
  stem = File.basename(relative, extension)
  siblings = Dir.glob(File.join(File.dirname(source), "#{stem}.*"))
                .reject { |file| file.end_with?('.meta') || file == source }
  if siblings.any?
    relative = relative.delete_suffix(extension) + "_#{extension.delete_prefix('.').downcase}#{extension}"
  end
  File.join(TARGET_LEGACY_ASSETS, relative)
end

source_relative, target_relative = ARGV
abort('usage: stage-native-prefab.rb <legacy resource prefab/fire> <target resource prefab/scene>') unless source_relative && target_relative
target_directory = File.dirname(target_relative)
target_extension = File.extname(target_relative)
target_basename = File.basename(target_relative, target_extension).sub(/\AUI(?=\S)/, '')
target_relative = File.join(target_directory, "#{target_basename}#{target_extension}")

source_roots = if explicit_legacy_root
                 LEGACY_ROOTS
               elsif target_relative.include?('/scjymj/')
                 LEGACY_RESOURCE_ROOTS.sort_by { |root| root.include?('Client_scjymj') ? 0 : 1 }
               elsif target_relative.include?('/hzmj/')
                 LEGACY_RESOURCE_ROOTS.sort_by { |root| root.include?('Client_hzmj') ? 0 : 1 }
               else
                 LEGACY_RESOURCE_ROOTS
               end
source_prefab = source_roots
                  .map { |root| File.expand_path(source_relative, root) }
                  .find { |candidate| File.file?(candidate) }
target_prefab = File.expand_path(target_relative, File.join(TARGET_ASSETS, 'resources'))
abort("legacy prefab not found: #{source_prefab}") unless File.file?(source_prefab)

uuid_cache_path = File.join(PROJECT_ROOT, 'work/stage-native-prefab-uuid-map.json')
uuid_map = if File.file?(uuid_cache_path)
             JSON.parse(File.read(uuid_cache_path))
           else
             legacy_uuid_sources = {}
             LEGACY_ROOTS.each do |legacy_root|
               walk_files(legacy_root, '.meta') do |meta_path|
                 index_legacy_meta(JSON.parse(File.read(meta_path)), meta_path.delete_suffix('.meta'), legacy_uuid_sources)
               rescue JSON::ParserError
                 warn("invalid legacy meta ignored: #{meta_path}")
               end
             end
             walk_files(LEGACY_INTERNAL, '.meta') do |meta_path|
               index_legacy_meta(JSON.parse(File.read(meta_path)), meta_path.delete_suffix('.meta'), legacy_uuid_sources)
             rescue JSON::ParserError
               warn("invalid legacy meta ignored: #{meta_path}")
             end
             built = {}
             legacy_uuid_sources.each do |legacy_uuid, source|
               target_asset = target_asset_for(source)
               target_meta_path = "#{target_asset}.meta"
               unless File.file?(target_meta_path)
                 target_legacy_root = File.join(TARGET_ASSETS, 'resources/legacy-ui')
                 candidates = Dir.glob(File.join(target_legacy_root, '**', "#{File.basename(source)}.meta"))
                                 .map { |meta_path| meta_path.delete_suffix('.meta') }
                                 .select do |candidate|
                   File.file?(candidate) && File.binread(candidate) == File.binread(source)
                 end
                 target_asset = candidates.first if candidates.length == 1
                 target_meta_path = "#{target_asset}.meta"
               end
               next unless File.file?(target_meta_path)

               target_meta = JSON.parse(File.read(target_meta_path))
               target_uuid = if File.extname(source).downcase.match?(/\A\.(png|jpg|jpeg|webp)\z/)
                               sprite_frame_uuid(target_meta)
                             else
                               target_meta['uuid']
                             end
               built[legacy_uuid] = target_uuid if target_uuid
             end
             FileUtils.mkdir_p(File.dirname(uuid_cache_path))
             File.write(uuid_cache_path, JSON.generate(built))
             built
           end

# Merge generated Prefab mappings as well as ordinary asset mappings. Some
# standalone games use non-RFC identifiers for Prefab instances, so scenes
# must resolve those identifiers through the native Prefab path map.
prefab_path_map_path = File.join(PROJECT_ROOT, 'assets/resources/native-ui/prefab-path-map.json')
if File.file?(prefab_path_map_path)
  JSON.parse(File.read(prefab_path_map_path)).each do |legacy_relative, target_without_extension|
    source = source_roots.map { |root| File.expand_path(legacy_relative, root) }.find { |candidate| File.file?(candidate) }
    next unless source && File.file?("#{source}.meta")

    source_uuid = JSON.parse(File.read("#{source}.meta"))['uuid']
    target_meta = File.join(TARGET_ASSETS, 'resources', "#{target_without_extension}.prefab.meta")
    next unless source_uuid && File.file?(target_meta)

    uuid_map[source_uuid] = JSON.parse(File.read(target_meta))['uuid']
  rescue JSON::ParserError
    next
  end
end

records = JSON.parse(File.read(source_prefab))
legacy_script_ids = records.each_index.select do |index|
  type = records[index].is_a?(Hash) ? records[index]['__type__'] : nil
  type && !type.start_with?('cc.')
end
legacy_prefab_camera_ids = records.each_index.select do |index|
  records[index].is_a?(Hash) && records[index]['__type__'] == 'cc.Camera'
end
detached_component_ids = legacy_script_ids | legacy_prefab_camera_ids
records.each_with_index.to_a.each do |record, node_index|
  next unless record.is_a?(Hash) && %w[cc.Node cc.PrivateNode].include?(record['__type__'])

  record['__type__'] = 'cc.Node'

  transform = record.dig('_trs', 'array') || [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
  is_root = record['_parent'].nil?
  record['_lpos'] = {
    '__type__' => 'cc.Vec3',
    'x' => is_root ? 0 : (transform[0] || 0),
    'y' => is_root ? 0 : (transform[1] || 0),
    'z' => is_root ? 0 : (transform[2] || 0)
  }
  record['_lrot'] = {
    '__type__' => 'cc.Quat',
    'x' => transform[3] || 0,
    'y' => transform[4] || 0,
    'z' => transform[5] || 0,
    'w' => transform[6] || 1
  }
  record['_lscale'] = {
    '__type__' => 'cc.Vec3',
    'x' => transform[7] || 1,
    'y' => transform[8] || 1,
    'z' => transform[9] || 1
  }
  record['_mobility'] = 0
  # Creator 3.8 Layers.Enum.UI_2D. Using bit 30 leaves the hierarchy intact
  # but excludes every Sprite from the prefab editor's UI camera.
  record['_layer'] = 1 << 25
  record['_euler'] = record['_eulerAngles'] || { '__type__' => 'cc.Vec3', 'x' => 0, 'y' => 0, 'z' => 0 }
  transform_id = records.length
  records << {
    '__type__' => 'cc.UITransform',
    '_name' => '',
    '_objFlags' => 0,
    'node' => { '__id__' => node_index },
    '_enabled' => true,
    '__prefab' => nil,
    '_contentSize' => record['_contentSize'] || { '__type__' => 'cc.Size', 'width' => 0, 'height' => 0 },
    '_anchorPoint' => record['_anchorPoint'] || { '__type__' => 'cc.Vec2', 'x' => 0.5, 'y' => 0.5 },
    '_id' => ''
  }
  record['_components'] ||= []
  # Creator 3 UI renderers and Widgets initialize from UITransform during
  # activation. It must be deserialized before those dependent components;
  # appending it leaves Sprite render vertices permanently at zero size.
  record['_components'].unshift({ '__id__' => transform_id })
  if (record['_opacity'] || 255) != 255
    opacity_id = records.length
    records << {
      '__type__' => 'cc.UIOpacity',
      '_name' => '',
      '_objFlags' => 0,
      'node' => { '__id__' => node_index },
      '_enabled' => true,
      '__prefab' => nil,
      '_opacity' => record['_opacity'],
      '_id' => ''
    }
    record['_components'] << { '__id__' => opacity_id }
  end
end
records.each do |record|
  next unless record.is_a?(Hash)

  # Creator 2.x serialized many public component properties with an `_N$`
  # prefix. Creator 3.x reads the same properties from their canonical `_`
  # names; retaining only the legacy keys silently drops layout/outline/mask
  # values even though deserialization itself succeeds.
  record.keys.grep(/\A_N\$/).each do |legacy_key|
    current_key = "_#{legacy_key.delete_prefix('_N$')}"
    record[current_key] = Marshal.load(Marshal.dump(record[legacy_key])) unless record.key?(current_key)
  end

  # Creator 2 stores WebGL blend constants; Creator 3 serializes gfx
  # BlendFactor enum ordinals. Leaving 770/771 intact submits geometry but
  # produces black Sprite output on the 3.8 WebGL pipeline.
  blend_factors = {
    768 => 6, 769 => 8, 770 => 2, 771 => 4, 772 => 3,
    773 => 5, 774 => 7, 775 => 9, 776 => 10
  }
  if record.key?('_srcBlendFactor')
    record['_srcBlendFactor'] = blend_factors.fetch(record['_srcBlendFactor'], record['_srcBlendFactor'])
  end
  if record.key?('_dstBlendFactor')
    record['_dstBlendFactor'] = blend_factors.fetch(record['_dstBlendFactor'], record['_dstBlendFactor'])
  end

  # Creator 3 renamed the serialized Scrollbar class while retaining its
  # behavior and property model.
  record['__type__'] = 'cc.ScrollBar' if record['__type__'] == 'cc.Scrollbar'
  record['__type__'] = 'cc.ToggleContainer' if record['__type__'] == 'cc.ToggleGroup'
  record['__type__'] = 'cc.ClickEvent' if record['__type__'] == 'cc.Component.EventHandler'
  if record['__type__'] == 'cc.ParticleSystem'
    record['__type__'] = 'cc.ParticleSystem2D'
    record['_customMaterial'] = nil
    record['_materials'] = []
  end
  if record['__type__'] == 'cc.Button'
    record['_interactable'] = record.fetch('_N$interactable', true)
    record['_transition'] = record['_N$transition'] || record['transition'] || 0
    record['_normalColor'] = record['_N$normalColor'] if record['_N$normalColor']
    record['_pressedColor'] = record['_N$pressedColor'] if record['_N$pressedColor']
    record['_hoverColor'] = record['_N$hoverColor'] if record['_N$hoverColor']
    record['_disabledColor'] = record['_N$disabledColor'] if record['_N$disabledColor']
    record['_normalSprite'] = record['_N$normalSprite'] if record.key?('_N$normalSprite')
    record['_pressedSprite'] = record['_N$pressedSprite'] if record.key?('_N$pressedSprite')
    record['_hoverSprite'] = record['_N$hoverSprite'] if record.key?('_N$hoverSprite')
    record['_disabledSprite'] = record['_N$disabledSprite'] if record.key?('_N$disabledSprite')
    record['_duration'] = record['duration'] || 0.1
    record['_zoomScale'] = record['zoomScale'] || 1.2
    # Do not alias the legacy reference hash here. The object-table reorder
    # walks every serialized field and remaps each __id__; sharing the same
    # hash between _N$target and _target would remap that id twice and make
    # Button target a random component instead of its Node.
    record['_target'] = Marshal.load(Marshal.dump(record['_N$target'])) if record.key?('_N$target')
  end
  if %w[cc.Sprite cc.Label cc.RichText].include?(record['__type__'])
    source_node = records.dig(record.dig('node', '__id__'))
    record['_color'] ||= source_node&.dig('_color') || {
      '__type__' => 'cc.Color', 'r' => 255, 'g' => 255, 'b' => 255, 'a' => 255
    }
    record['_customMaterial'] = nil unless record.key?('_customMaterial')
    record['__prefab'] = nil unless record.key?('__prefab')
  end
  if record['__type__'] == 'cc.Sprite'
    # 2.x serialized its built-in sprite material as an asset UUID. That
    # material is not a valid 3.x renderer override; an empty override list
    # lets Sprite select Creator 3's built-in material for the active pipeline.
    record['_materials'] = []
    record['_useGrayscale'] = false unless record.key?('_useGrayscale')
  elsif record['__type__'] == 'cc.Label'
    # Creator 3's dynamic glyph atlas is premultiplied-alpha and therefore
    # uses ONE / ONE_MINUS_SRC_ALPHA rather than Sprite's SRC_ALPHA pair.
    record['_srcBlendFactor'] = 1
    record['_dstBlendFactor'] = 4
    record['_horizontalAlign'] = record['_N$horizontalAlign'] || record['_horizontalAlign'] || 0
    record['_verticalAlign'] = record['_N$verticalAlign'] || record['_verticalAlign'] || 0
    record['_overflow'] = record['_N$overflow'] || record['_overflow'] || 0
    record['_font'] = record['_N$file'] if record['_N$file']
    record['_fontFamily'] ||= 'Arial'
    record['_isSystemFontUsed'] = record['_font'].nil?
  elsif record['__type__'] == 'cc.RichText'
    record['_srcBlendFactor'] = 1
    record['_dstBlendFactor'] = 4
  end
  if record['_components'].is_a?(Array)
    record['_components'].reject! { |reference| detached_component_ids.include?(reference['__id__']) }
  end
  # UI event dispatch is owned by the 3.8 lifecycle controller. Keeping 2.x
  # component-id strings would bind buttons to classes that cannot exist in 3.x.
  record['clickEvents'] = [] if record['__type__'] == 'cc.Button'
  if record['__type__'] == 'cc.EditBox'
    record['editingDidBegan'] = []
    record['textChanged'] = []
    record['editingDidEnded'] = []
    record['editingReturn'] = []
  end
end
detached_component_ids.each { |index| records[index] = nil }

# Serialized object construction follows record order, not only the order of a
# node's component references. Put every UITransform record immediately after
# its Node so dependent Sprite/Widget components cannot initialize against an
# as-yet unconstructed transform. Remap every object-table reference afterward.
transform_for_node = {}
records.each_with_index do |record, index|
  next unless record.is_a?(Hash) && record['__type__'] == 'cc.UITransform'

  transform_for_node[record.dig('node', '__id__')] = index
end
order = []
records.each_with_index do |record, index|
  next if record.is_a?(Hash) && record['__type__'] == 'cc.UITransform'

  order << index
  transform_index = transform_for_node[index]
  order << transform_index if transform_index
end
transform_for_node.each_value { |index| order << index unless order.include?(index) }
index_map = order.each_with_index.to_h
records = order.map { |old_index| records[old_index] }
remap_ids = lambda do |value|
  case value
  when Array
    value.each { |child| remap_ids.call(child) }
  when Hash
    if value.keys == ['__id__'] && index_map.key?(value['__id__'])
      value['__id__'] = index_map.fetch(value['__id__'])
    else
      value.each_value { |child| remap_ids.call(child) }
    end
  end
end
remap_ids.call(records)

# Remap asset references structurally. Global string replacement can remap a
# UUID that was already converted by an earlier entry (for example appending
# @f9941 twice), which produced thousands of valid-looking missing references.
remap_uuids = lambda do |value|
  case value
  when Array
    value.each { |child| remap_uuids.call(child) }
  when Hash
    if value['__uuid__'].is_a?(String) && uuid_map.key?(value['__uuid__'])
      value['__uuid__'] = uuid_map.fetch(value['__uuid__'])
    end
    value.each_value { |child| remap_uuids.call(child) }
  end
end
remap_uuids.call(records)

# Some 2.x Button transition sprites reference assets that no longer exist in
# either source tree. Creator 3 treats those stale UUIDs as missing build
# dependencies even though the node's Sprite still owns its normal artwork.
# Drop only unresolved Button-state references; preserve every mapped project
# asset and Creator built-in asset.
available_asset_uuids = {}
walk_files(TARGET_ASSETS, '.meta') do |meta_path|
  index_legacy_meta(JSON.parse(File.read(meta_path)), meta_path.delete_suffix('.meta'), available_asset_uuids)
rescue JSON::ParserError
  next
end
builtin_asset_uuids = [
  'eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432',
  '3a7bb79f-32fd-422e-ada2-96f518fed422'
]
records.each do |record|
  next unless record.is_a?(Hash) && record['__type__'] == 'cc.Button'

  %w[normalSprite pressedSprite hoverSprite disabledSprite _normalSprite _pressedSprite _hoverSprite _disabledSprite _N$normalSprite _N$pressedSprite _N$hoverSprite _N$disabledSprite].each do |field|
    uuid = record.dig(field, '__uuid__')
    next unless uuid.is_a?(String)

    # Sprite-state assets are meaningful only for Button.Transition.SPRITE.
    # Creator 2 projects also serialize stale bare UUIDs here; those UUIDs can
    # collide with another migrated asset and are not valid Creator 3
    # SpriteFrame references. Imported SpriteFrames use the `texture@subAsset`
    # form, while engine built-ins are explicitly allow-listed above.
    sprite_transition = record['_transition'] == 2
    valid_sprite_frame = uuid.include?('@') && available_asset_uuids.key?(uuid.split('@', 2).first)
    next if sprite_transition && (valid_sprite_frame || builtin_asset_uuids.include?(uuid))

    record[field] = nil
  end
end

# A few legacy labels reference bitmap-font files whose atlas image was never
# shipped with the 2.2.2 project. Creator 3 cannot import those incomplete
# fonts. Keep the authored text and layout, but let those labels use the
# system font instead of retaining a permanently missing asset reference.
records.each do |record|
  next unless record.is_a?(Hash) && record['__type__'] == 'cc.Label'

  font_uuid = record.dig('_font', '__uuid__')
  next unless font_uuid.is_a?(String)
  next if uuid_map.key?(font_uuid) || available_asset_uuids.key?(font_uuid.split('@', 2).first)

  record['_font'] = nil
  record['_isSystemFontUsed'] = true
end

root_node = records.find { |record| record.is_a?(Hash) && record['__type__'] == 'cc.Node' && record['_parent'].nil? }
root_node['_name'] = target_basename if root_node

# Creator 2.2 serialized Layout.resizeMode as `_resize`; Creator 3.8 reads
# `_resizeMode`. Keeping only the legacy key leaves the 3.8 component at NONE,
# so containers stop resizing when children are enabled dynamically.
records.each do |record|
  next unless record.is_a?(Hash) && record['__type__'] == 'cc.Layout'
  next unless record.key?('_resize')

  record['_resizeMode'] = record.delete('_resize')
end

serialized = JSON.pretty_generate(records)
referenced = serialized.scan(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i).uniq
source_meta_path = "#{source_prefab}.meta"
source_meta = File.file?(source_meta_path) ? JSON.parse(File.read(source_meta_path)) : {}
self_uuid = source_meta['uuid']
uuid_pattern = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
target_uuid = self_uuid if self_uuid&.match?(uuid_pattern)
unless target_uuid
  hex = Digest::SHA256.hexdigest("creator-3.8-prefab:#{source_relative}")[0, 32].chars
  hex[12] = '4'
  hex[16] = %w[8 9 a b][hex[16].to_i(16) % 4]
  stable = hex.join
  target_uuid = [stable[0, 8], stable[8, 4], stable[12, 4], stable[16, 4], stable[20, 12]].join('-')
end
serialized = serialized.gsub(self_uuid, target_uuid) if self_uuid && self_uuid != target_uuid
# Third-party Creator 2 projects sometimes used non-RFC, game-prefixed UUIDs
# for the prefab owner's PrefabInfo. They cannot be imported by Creator 3.8.
# Only repair unresolved PrefabInfo assets in prefab files; valid nested prefab
# references remain untouched.
unless target_extension == '.scene'
  normalized_records = JSON.parse(serialized)
  normalized_records.each do |record|
    next unless record.is_a?(Hash) && record['__type__'] == 'cc.PrefabInfo'

    asset_uuid = record.dig('asset', '__uuid__')
    next unless asset_uuid.is_a?(String)
    asset_base_uuid = asset_uuid.split('@', 2).first
    next if asset_uuid == target_uuid || uuid_map.key?(asset_uuid) || available_asset_uuids.key?(asset_base_uuid)

    record['asset']['__uuid__'] = target_uuid
  end
  serialized = JSON.pretty_generate(normalized_records)
end
referenced = serialized.scan(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i).uniq
# Creator 2.x serializes its built-in default materials as UUID references even
# though they have no project asset metadata. Creator's native upgrader owns
# their conversion, so only project-asset UUIDs are remapped here.
builtin_uuids = [
  'eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432', # builtin-2d-sprite
  '3a7bb79f-32fd-422e-ada2-96f518fed422'  # builtin-2d-gray-sprite
]
mapped_targets = uuid_map.values.map { |uuid| uuid.to_s.split('@', 2).first }.uniq
missing = referenced.reject do |uuid|
  uuid_map.key?(uuid) || mapped_targets.include?(uuid) || available_asset_uuids.key?(uuid) ||
    uuid == self_uuid || uuid == target_uuid || builtin_uuids.include?(uuid)
end
abort("unresolved prefab asset UUIDs:\n#{missing.sort.join("\n")}") unless missing.empty?

FileUtils.mkdir_p(File.dirname(target_prefab))
File.write(target_prefab, "#{serialized}\n")
is_scene = target_extension == '.scene'
File.write("#{target_prefab}.meta", "#{JSON.pretty_generate({
  'ver' => '1.1.50',
  'importer' => is_scene ? 'scene' : 'prefab',
  'imported' => true,
  'uuid' => target_uuid,
  'files' => ['.json'],
  'subMetas' => {},
  'userData' => is_scene ? {} : { 'syncNodeName' => target_basename }
})}\n")
puts JSON.pretty_generate(
  source: source_prefab,
  target: target_prefab,
  remapped_uuid_count: referenced.length,
  detached_legacy_script_count: legacy_script_ids.length,
  detached_legacy_prefab_camera_count: legacy_prefab_camera_ids.length
)
