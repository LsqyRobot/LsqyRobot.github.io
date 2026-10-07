#pragma once

#include <cstddef>
#include <memory>
#include <stdexcept>
#include <utility>
#include <vector>

// Teaching container: owns its nodes, has no public mutable node pointers.
class LinkedList {
    struct Node {
        int value;
        std::unique_ptr<Node> next;
        explicit Node(int v) : value(v) {}
    };

    std::unique_ptr<Node> head_;
    std::size_t size_ = 0;

public:
    LinkedList() = default;
    ~LinkedList() { clear(); }

    LinkedList(const LinkedList&) = delete;
    LinkedList& operator=(const LinkedList&) = delete;
    LinkedList(LinkedList&&) = delete;
    LinkedList& operator=(LinkedList&&) = delete;

    [[nodiscard]] bool empty() const noexcept { return size_ == 0; }
    [[nodiscard]] std::size_t size() const noexcept { return size_; }

    // Valid insertion positions: [0, size()]. No allocation before validation.
    void insert(std::size_t index, int value) {
        if (index > size_) {
            throw std::out_of_range("LinkedList::insert");
        }
        auto* link = &head_;
        for (std::size_t i = 0; i < index; ++i) {
            link = &((*link)->next);
        }
        auto node = std::make_unique<Node>(value);
        node->next = std::move(*link);
        *link = std::move(node);
        ++size_;
    }

    void push_front(int value) { insert(0, value); }
    void append(int value) { insert(size_, value); }  // O(n), no tail pointer.

    // Valid deletion positions: [0, size()). Returns the removed value.
    int erase(std::size_t index) {
        if (index >= size_) {
            throw std::out_of_range("LinkedList::erase");
        }
        auto* link = &head_;
        for (std::size_t i = 0; i < index; ++i) {
            link = &((*link)->next);
        }
        auto removed = std::move(*link);
        *link = std::move(removed->next);
        --size_;
        return removed->value;
    }

    [[nodiscard]] int at(std::size_t index) const {
        if (index >= size_) {
            throw std::out_of_range("LinkedList::at");
        }
        const Node* current = head_.get();
        for (std::size_t i = 0; i < index; ++i) {
            current = current->next.get();
        }
        return current->value;
    }

    // One node moves from the unreversed suffix to the reversed prefix.
    void reverse() noexcept {
        std::unique_ptr<Node> previous;
        while (head_) {
            auto next = std::move(head_->next);
            head_->next = std::move(previous);
            previous = std::move(head_);
            head_ = std::move(next);
        }
        head_ = std::move(previous);
    }

    // Detach the successor before destroying a node: no recursive chain delete.
    void clear() noexcept {
        while (head_) {
            auto removed = std::move(head_);
            head_ = std::move(removed->next);
        }
        size_ = 0;
    }

    [[nodiscard]] std::vector<int> to_vector() const {
        std::vector<int> result;
        result.reserve(size_);
        for (const Node* node = head_.get(); node; node = node->next.get()) {
            result.push_back(node->value);
        }
        return result;
    }
};
