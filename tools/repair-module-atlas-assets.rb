#!/usr/bin/env ruby
# frozen_string_literal: true

require 'digest'
require 'fileutils'
require 'json'

CLIENT = File.expand_path('..', __dir__)
ASSETS = File.join(CLIENT, 'assets')
MODULES = File.join(ASSETS, 'Modules')
MANIFEST = File.join(CLIENT, 'work', 'module-atlas-localization.json')
IMAGE_EXTENSIONS = %w[.png .jpg .jpeg .webp .plist].freeze

def uuid?(value)
  value.is_a?(String) && value.match?(/\A[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?:@[0-9a-f]+)?\z/i)
end

def uuid_pairs(source, clone, pairs = {})
  if uuid?(source) && uuid?(clone)
    pairs[clone] = source
  elsif source.is_a?(Array) && clone.is_a?(Array)
    source.zip(clone) { |left, right| uuid_pairs(left, right, pairs) }
  elsif source.is_a?(Hash) && clone.is_a?(Hash)
    source.each { |key, value| uuid_pairs(value, clone[key], pairs) }
  end
  pairs
end

def image?(path)
  IMAGE_EXTENSIONS.include?(File.extname(path).downcase)
end

def asset_refs
  refs = Hash.new { |hash, key| hash[key] = [] }
  Dir.glob(File.join(ASSETS, '**', '*.{prefab,scene}')).each do |path|
    File.read(path).scan(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i).uniq.each do |uuid|
      refs[uuid] << path
    end
  end
  refs
end

def metadata(path)
  JSON.parse(File.read("#{path}.meta"))
end

def candidate_for(entry)
  expected = File.join(CLIENT, entry.fetch('destination'))
  return expected if File.file?(expected) && File.file?("#{expected}.meta")

  source = File.join(CLIENT, entry.fetch('source'))
  digest = Digest::SHA256.file(source).hexdigest
  atlas = File.join(MODULES, entry.fetch('module'), 'Atlas')
  matches = Dir.glob(File.join(atlas, '**', File.basename(source))).select do |path|
    File.file?(path) && File.file?("#{path}.meta") && Digest::SHA256.file(path).hexdigest == digest
  end
  return matches.first if matches.length == 1

  return nil if matches.empty?
  raise "cannot uniquely resolve duplicate for #{entry.fetch('destination')}: #{matches.join(', ')}"
end

def category_for(source)
  parts = source.split(File::SEPARATOR)
  return 'Room' if parts.include?('CreateRoomV2')
  return 'Controls' if parts.each_cons(2).include?(%w[internal image])
  return 'Poker' if parts.each_cons(3).include?(%w[Games Poker Common])
  texture = parts.index('texture')
  return parts[(texture + 1)..].first(2).join('-').sub(/\A\z/, 'Texture') if texture

  File.basename(File.dirname(source)).sub(/\A\z/, 'Assets')
end

entries = JSON.parse(File.read(MANIFEST)).fetch('assets')
refs = asset_refs
missing_sources = []
plans = entries.map do |entry|
  source = File.join(CLIENT, entry.fetch('source'))
  unless File.file?(source) && File.file?("#{source}.meta")
    missing_sources << entry.fetch('source')
    next
  end
  clone = candidate_for(entry)
  original = metadata(source)
  duplicate = clone ? metadata(clone) : nil
  pairs = duplicate ? uuid_pairs(original, duplicate) : {}
  source_uuid = original.fetch('uuid')
  { entry: entry, source: source, clone: clone, pairs: pairs, source_uuid: source_uuid }
end.compact

owners = Hash.new { |hash, key| hash[key] = [] }
plans.each do |plan|
  owners[plan[:source]] += refs[plan[:source_uuid]]
  plan[:pairs].each_key { |clone_uuid| owners[plan[:source]] += refs[clone_uuid.split('@').first] }
end

plans.each do |plan|
  module_refs = owners[plan[:source]].grep(%r{/assets/Modules/}).map { |path| path.split('/Modules/').last.split('/').first }.uniq
  external_refs = owners[plan[:source]].any? { |path| !path.include?('/assets/Modules/') }
  plan[:owner] = !external_refs && module_refs.length == 1 ? module_refs.first : nil
end

unless ARGV.include?('--apply')
  summary = plans.group_by { |plan| plan[:owner] || 'Common' }.transform_values(&:length)
  puts JSON.pretty_generate(total: plans.length, missing_sources: missing_sources.uniq, destination_groups: summary, action: 'rerun with --apply')
  exit
end

uuid_map = {}
plans.each { |plan| plan[:pairs].each { |clone, original| uuid_map[clone] = original } }
Dir.glob(File.join(MODULES, '**', '*.prefab')).each do |path|
  source = File.read(path)
  updated = uuid_map.sort_by { |key, _| -key.length }.reduce(source) { |text, (old_uuid, new_uuid)| text.gsub("\"#{old_uuid}\"", "\"#{new_uuid}\"") }
  File.write(path, updated) if updated != source
end

plans.each do |plan|
  next unless plan[:clone]
  File.delete(plan[:clone])
  File.delete("#{plan[:clone]}.meta")
end

plans.group_by { |plan| plan[:source] }.each_value do |group|
  plan = group.first
  next unless plan[:owner]

  destination = File.join(MODULES, plan[:owner], 'Atlas', category_for(plan[:source]), File.basename(plan[:source]))
  FileUtils.mkdir_p(File.dirname(destination))
  raise "destination exists: #{destination}" if File.exist?(destination)
  FileUtils.mv(plan[:source], destination)
  FileUtils.mv("#{plan[:source]}.meta", "#{destination}.meta")
end

Dir.glob(File.join(MODULES, '**', 'Imported')).sort_by(&:length).reverse_each do |directory|
  next unless Dir.exist?(directory) && Dir.children(directory).empty?
  Dir.rmdir(directory)
  File.delete("#{directory}.meta") if File.file?("#{directory}.meta")
end

puts JSON.pretty_generate(moved: plans.count { |plan| plan[:owner] }, restored_shared: plans.count { |plan| !plan[:owner] })
