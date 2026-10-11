#pragma once

#include <atomic>
#include <deque>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

namespace nebius {

// Local-only, fixed endpoint. This client exposes no filesystem, network URL,
// process execution, or Lua evaluation capability.
class BridgeClient {
public:
    BridgeClient() = default;
    ~BridgeClient();

    BridgeClient(const BridgeClient&) = delete;
    BridgeClient& operator=(const BridgeClient&) = delete;

    std::optional<std::string> Poll();
    bool Ack(const std::string& id);

private:
    static constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\nebius_isaac_bridge_v1";
    static constexpr size_t kMaxQueuedMessages = 32;

    void StartWorker();
    void WorkerMain();
    static bool Request(const std::string& request, std::string* response);

    std::atomic<bool> _running{false};
    std::thread _worker;
    std::mutex _mutex;
    std::deque<std::string> _incoming;
    std::deque<std::string> _outgoingAcks;
};

} // namespace nebius
